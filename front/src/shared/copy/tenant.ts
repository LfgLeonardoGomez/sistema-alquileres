// design D32 (copy lives in `shared/copy/**`, glossary-tested). The tenant
// settings BOTTOM SHEET (never a screen -- the design handoff's own
// Interactions & Behavior section is explicit: "no settings screen"),
// reached from Home beside the existing "Cerrar sesión" affordance
// (`HomeScreen.tsx`), on `GuestSheet.tsx`/`CabinEditSheet.tsx`'s own
// precedent for an undrawn "tap to open a sheet" surface.
//
// `back/app/schemas/tenant.py`'s `TenantUpdate` makes `whatsapp` the ONLY
// writable field (`extra="forbid"` -- sending `name` is a 422, not a
// silent ignore): the tenant's business name is immutable after
// registration by design, so this sheet shows it READ-ONLY and edits only
// WhatsApp.
//
// THE GAP THIS COPY CLOSES: the backend's `normalise_whatsapp` validator
// requires 8-15 digits but does NOT require a country code -- a plausible
// local number like "2612094262" (10 digits) passes validation, saves
// successfully, and produces a SILENTLY BROKEN `wa.me` link that nobody
// discovers until a guest cannot message the owner. `whatsappHelp` states
// the required international shape explicitly, with a real worked example,
// so a non-technical owner gets it right the first time.
export const TENANT_SETTINGS_COPY = {
  openSettings: 'Ajustes',
  title: 'Ajustes',
  businessNameLabel: 'Nombre del negocio',
  whatsappLabel: 'WhatsApp para que te escriban',
  whatsappHelp: 'Con el código de país adelante, sin el 0 ni el 15. Por ejemplo, para Argentina: 549 261 209 4262.',
  save: 'Guardar',
  close: 'Volver',
} as const
