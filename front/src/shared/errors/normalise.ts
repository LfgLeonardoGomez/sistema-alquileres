import type { ApiError } from './ApiError'

// design D32: no real HTTP response from this API ever reports status 0.
// `client.ts` (1.24) uses this sentinel for a thrown `TypeError` (network
// failure / CORS rejection / offline) -- a case that reaches this function
// with no real status and no body at all -- so `resolve.ts`'s status table
// has one place to hang the "no pudimos conectar" copy on.
export const NETWORK_FAILURE_STATUS = 0

interface ParsedErrorBody {
  readonly detail?: unknown
  readonly code?: unknown
}

function isParsedErrorBody(value: unknown): value is ParsedErrorBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses a backend response's status and body into the app's structured
 * `ApiError`. `detail` is English prose written for API consumers -- it is
 * logged once for a developer and then discarded; it does not exist on
 * `ApiError`'s type (1.17), so nothing downstream can render it.
 *
 * Tolerates two shapes that are not the API's own `{detail, code}` contract
 * without throwing: a missing body entirely (a network failure has none),
 * and FastAPI's own `RequestValidationError` shape, `{"detail": [...]}` --
 * a list, with no `code` (design D32's "422 shape gotcha").
 */
export function normalise(status: number, body: unknown): ApiError {
  if (!isParsedErrorBody(body)) {
    return { status, code: null }
  }

  if (body.detail !== undefined) {
    console.error('[api] request failed:', { status, detail: body.detail })
  }

  return { status, code: typeof body.code === 'string' ? body.code : null }
}
