import { ERROR_COPY_BY_CODE, ERROR_COPY_BY_STATUS, GENERIC_ERROR_COPY } from '../copy/errors'
import type { ApiError } from './ApiError'

/**
 * Resolves an `ApiError` to the Spanish sentence the owner sees, per design
 * D32's resolution order:
 *
 * 1. A call-site override (the same `409 dates_unavailable` reads
 *    differently in the wizard than on the edit screen).
 * 2. Otherwise, `code` -> sentence.
 * 3. Otherwise, `status` -> sentence.
 * 4. Otherwise, one generic sentence.
 *
 * No step interpolates the status, the code, or the API's `detail` into
 * copy -- there is no template that accepts one, only a fixed lookup.
 */
export function resolveErrorCopy(error: ApiError, override?: string): string {
  if (override !== undefined) return override

  if (error.code !== null) {
    const byCode = ERROR_COPY_BY_CODE[error.code]
    if (byCode !== undefined) return byCode
  }

  const byStatus = ERROR_COPY_BY_STATUS[error.status]
  if (byStatus !== undefined) return byStatus

  return GENERIC_ERROR_COPY
}
