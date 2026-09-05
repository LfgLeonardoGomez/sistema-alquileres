import { describe, expect, it } from 'vitest'
import { NETWORK_FAILURE_STATUS } from './normalise'
import { resolveErrorCopy } from './resolve'

// design D32: resolution order is call-site override -> code -> status ->
// generic. At no point is a code, a status, or the API's `detail`
// interpolated into copy -- there is no template that accepts one.

describe('resolveErrorCopy', () => {
  it('resolves a 409 dates_unavailable error to the drafted copy, with none of the forbidden words', () => {
    const copy = resolveErrorCopy({ status: 409, code: 'dates_unavailable' })

    expect(copy).toBe('Esas noches ya están ocupadas. Elegí otras.')
    expect(copy.toLowerCase()).not.toContain('conflicto')
    expect(copy.toLowerCase()).not.toContain('error')
    expect(copy).not.toContain('409')
  })

  it('prefers a call-site override over the code and status resolution', () => {
    const copy = resolveErrorCopy(
      { status: 409, code: 'dates_unavailable' },
      'Ese teléfono ya está anotado en otra reserva de este huésped.',
    )

    expect(copy).toBe('Ese teléfono ya está anotado en otra reserva de este huésped.')
  })

  it('falls back to a status-keyed sentence when the code has no entry', () => {
    const copy = resolveErrorCopy({ status: 422, code: null })

    expect(copy).toBe('Revisá los datos y probá de nuevo.')
  })

  it('falls back to the generic sentence when neither code nor status has an entry', () => {
    const copy = resolveErrorCopy({ status: 418, code: null })

    expect(copy).toBe('Algo no anduvo. Probá de nuevo en un momento.')
  })

  it('resolves the network-failure sentinel to the offline copy', () => {
    const copy = resolveErrorCopy({ status: NETWORK_FAILURE_STATUS, code: null })

    expect(copy).toBe('No pudimos conectar. Fijate si tenés internet y probá de nuevo.')
  })
})
