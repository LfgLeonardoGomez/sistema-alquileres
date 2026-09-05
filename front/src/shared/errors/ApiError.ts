// design D32: the API returns `{detail, code}`, and `detail` is English
// prose written for API consumers ("Dates are not available", "Referenced
// record not found") -- never for the owner. The structural move is
// subtraction: `detail` is deliberately absent from this type. A field
// that does not exist here cannot reach a screen, the same mechanism as
// D23's allowlist formatter and D9's column projection.
export type ApiError = {
  readonly status: number
  readonly code: string | null
}
