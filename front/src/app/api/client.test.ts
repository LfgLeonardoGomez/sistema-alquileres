import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NETWORK_FAILURE_STATUS } from '../../shared/errors/normalise'
import { server } from '../../test/setup'

// design D32: `fetch` rejects with an indistinguishable TypeError for a
// dropped connection and a CORS rejection. `client.ts` is the app's one
// network call site (1.25); it must never leak a raw exception to caller
// code -- every failure is routed through 1.19's `normalise()` into a
// structured `ApiError` (1.17: no `detail` field, structurally).

describe('apiRequest', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('normalises a network failure with no response body into a structured ApiError, never an unhandled rejection', async () => {
    server.use(http.get('http://localhost:8000/reservations', () => HttpResponse.error()))

    const { apiRequest } = await import('./client')

    await expect(apiRequest('/reservations')).rejects.toEqual({
      status: NETWORK_FAILURE_STATUS,
      code: null,
    })
  })

  // Triangulates against a different failure shape entirely: a real,
  // shaped `{detail, code}` response, proving the same call site routes
  // both through 1.19's `normalise()` rather than special-casing the
  // network branch.
  it('normalises a shaped 409 response into a structured ApiError, discarding detail', async () => {
    server.use(
      http.post('http://localhost:8000/reservations', () =>
        HttpResponse.json({ detail: 'Dates are not available', code: 'dates_unavailable' }, { status: 409 }),
      ),
    )

    const { apiRequest } = await import('./client')

    await expect(apiRequest('/reservations', { method: 'POST' })).rejects.toEqual({
      status: 409,
      code: 'dates_unavailable',
    })
  })

  it('resolves with the decoded JSON body on a successful request, built against the same env.ts base URL', async () => {
    server.use(
      http.get('http://localhost:8000/dashboard/summary', () =>
        HttpResponse.json({ occupied_nights: 18, capacity_nights: 60 }),
      ),
    )

    const { apiRequest } = await import('./client')

    await expect(apiRequest('/dashboard/summary')).resolves.toEqual({
      occupied_nights: 18,
      capacity_nights: 60,
    })
  })
})
