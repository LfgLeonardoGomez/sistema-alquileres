import { describe, expect, it, vi } from 'vitest'
import { normalise } from './normalise'

// design D32: the API's `detail` is English prose written for API
// consumers and must never reach a screen -- it is parsed, logged to the
// console for a developer, and discarded. `code` is the only thing that
// survives into the returned `ApiError`.

describe('normalise', () => {
  it('normalises a shaped {detail, code} response, discarding detail', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = normalise(409, { detail: 'Dates are not available', code: 'dates_unavailable' })

    expect(result).toEqual({ status: 409, code: 'dates_unavailable' })
    expect(result).not.toHaveProperty('detail')
    consoleSpy.mockRestore()
  })

  it('logs the discarded detail to the console for a developer', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    normalise(409, { detail: 'Dates are not available', code: 'dates_unavailable' })

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy.mock.calls[0]).toContainEqual(
      expect.objectContaining({ detail: 'Dates are not available' }),
    )
    consoleSpy.mockRestore()
  })

  // FastAPI's own RequestValidationError shape: `{"detail": [...]}`, a list,
  // with no `code` at all -- breaks the `{detail, code}` contract every
  // other response in this API follows (design D32's "422 shape gotcha").
  it('tolerates a malformed FastAPI 422 body without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() =>
      normalise(422, {
        detail: [{ type: 'missing', loc: ['body', 'price_per_night'], msg: 'Field required' }],
      }),
    ).not.toThrow()

    const result = normalise(422, { detail: [{ type: 'missing' }] })
    expect(result.status).toBe(422)
    expect(result.code).toBeNull()
    consoleSpy.mockRestore()
  })

  // A network failure has no body at all -- client.ts (1.24) calls this
  // with `undefined` for a thrown TypeError.
  it('tolerates a missing body entirely, without throwing', () => {
    expect(() => normalise(0, undefined)).not.toThrow()
    expect(normalise(0, undefined)).toEqual({ status: 0, code: null })
  })

  // Discovered against the real backend (back/app/errors.py): a plain
  // HTTPException raised via `errors.not_found()` / `errors.unauthorized()`
  // / `errors.forbidden()` / `errors.invalid()` produces FastAPI's default
  // `{"detail": "..."}` body -- with NO `code` key at all, not `code: null`.
  // Only the IntegrityError-driven responses (23P01/23505/23503/23514) ever
  // carry a `code`. This is not the 422-list gotcha; it is a real, distinct
  // shape this normaliser must also tolerate.
  it('tolerates a real 404 body carrying no code key at all', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = normalise(404, { detail: 'Not found' })

    expect(result).toEqual({ status: 404, code: null })
    consoleSpy.mockRestore()
  })
})
