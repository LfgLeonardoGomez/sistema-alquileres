import { NETWORK_FAILURE_STATUS } from '../errors/normalise'

// design D32's drafted copy table (Open Question 1 in design.md: the
// register is the owner's to confirm, not this table's to invent). At no
// point is a status, a code, or the API's `detail` interpolated into any
// of these -- there is no template that accepts one, only a fixed lookup.
//
// The 401 row is deliberately absent: "no message in place -- D29's path"
// (owner-session's own redirect copy, Phase 3, not this table).

export const GENERIC_ERROR_COPY = 'Algo no anduvo. Probá de nuevo en un momento.'

// Named once, so the code-keyed and status-keyed tables below can share the
// exact same string for the two codes ('not_found', 'invalid') that also
// have a real HTTP status behind them (design's own backend has both a
// code-carrying path, via the SQLSTATE dispatch table, and a plain
// `HTTPException` path with no `code` at all -- see normalise.ts).
const NOT_FOUND_COPY = 'No encontramos eso. Puede que ya no esté.'
const INVALID_COPY = 'Revisá los datos y probá de nuevo.'

export const ERROR_COPY_BY_CODE: Readonly<Record<string, string>> = {
  dates_unavailable: 'Esas noches ya están ocupadas. Elegí otras.',
  duplicate: 'Ese teléfono ya es de otro huésped.',
  not_found: NOT_FOUND_COPY,
  invalid: INVALID_COPY,
}

export const ERROR_COPY_BY_STATUS: Readonly<Record<number, string>> = {
  404: NOT_FOUND_COPY,
  422: INVALID_COPY,
  429: 'Probá de nuevo en un ratito.',
  500: GENERIC_ERROR_COPY,
  // `client.ts` (1.24) reports a thrown network TypeError -- CORS
  // rejection and dropped connectivity are indistinguishable to `fetch`
  // (design D32) -- under this sentinel status, never a real HTTP code.
  [NETWORK_FAILURE_STATUS]: 'No pudimos conectar. Fijate si tenés internet y probá de nuevo.',
}
