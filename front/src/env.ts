// The frontend analogue of "the app refuses to boot without JWT_SECRET"
// (design D37). VITE_API_BASE_URL and VITE_TENANT_SLUG have no default --
// a default pointing at localhost is precisely how a production build ships
// pointing at a developer's machine. Both are validated once, at module
// load, and this module throws naming whichever is missing.

function requireEnvVar(name: string): string {
  const value = import.meta.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy front/.env.example to front/.env and set it.`,
    )
  }
  return value
}

function optionalEnvVar(name: string): string | undefined {
  const value = import.meta.env[name]
  return value === undefined || value === '' ? undefined : value
}

export const env = {
  apiBaseUrl: requireEnvVar('VITE_API_BASE_URL'),
  tenantSlug: requireEnvVar('VITE_TENANT_SLUG'),
  // When unset, the "Escribinos por WhatsApp" button is not rendered at all
  // (design D37) -- a dead wa.me link fails only on the prospect's side,
  // where nobody will ever report it.
  whatsappNumber: optionalEnvVar('VITE_WHATSAPP_NUMBER'),
}
