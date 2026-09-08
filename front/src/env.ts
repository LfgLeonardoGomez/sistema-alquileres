// The frontend analogue of "the app refuses to boot without JWT_SECRET"
// (design D37). `VITE_API_BASE_URL` has no default -- a default pointing at
// localhost is precisely how a production build ships pointing at a
// developer's machine, and there is no other source for it at runtime.
// Validated once, at module load, and this module throws naming it if
// missing.
//
// `VITE_TENANT_SLUG` deliberately no longer shares that requirement
// (tenant-from-url change, owner-approved 2026-09-08): the tenant now
// resolves at RUNTIME from the URL (`/login/:slug`, then `?tenant=`) and
// from the slug persisted in `useSessionStore` (`app/session/store.ts`) --
// one build serves every tenant. This var becomes only the last-resort
// fallback for a login screen mounting with no slug anywhere in the URL and
// nothing yet persisted (a brand-new browser, first visit). An empty string
// when unset, not a fabricated default -- the same "no default" discipline
// D37 already applies, just landing at an empty value instead of a thrown
// error, since a genuinely unresolved slug is the URL/persisted-state
// resolution chain's problem to solve, not this module's.

function requireEnvVar(name: string): string {
  const value = import.meta.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy front/.env.example to front/.env and set it.`,
    )
  }
  return value
}

function optionalEnvVar(name: string): string {
  const value = import.meta.env[name]
  return value === undefined ? '' : value
}

export const env = {
  apiBaseUrl: requireEnvVar('VITE_API_BASE_URL'),
  tenantSlug: optionalEnvVar('VITE_TENANT_SLUG'),
}
