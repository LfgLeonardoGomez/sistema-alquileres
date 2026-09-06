// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 02 (Inicio) -- "deliberately empty": one occupancy card,
// one action, no revenue figure (home-summary spec "No Revenue Figure Is
// Ever Rendered", tasks 3.17/3.18). "Hola, Ana" is the handoff's own literal
// high-fidelity copy for the single owner this screen greets; no task in
// this run's scope (3.15-3.23) asks for a per-tenant name and no endpoint
// yet supplies one -- flagged in `HomeScreen.tsx`'s own module doc rather
// than invented silently.
//
// `MONTH_LABELS` duplicates `shared/copy/public.ts`'s own already-duplicated
// Spanish month list (itself a duplicate of `shared/date/format.ts`'s
// private `SPANISH_MONTHS`) rather than exporting from that load-bearing
// module -- the same reasoning `public.ts`'s own note gives, and this run
// was told not to touch `shared/` outside a new copy file. Capitalised here
// (this screen's label reads standalone, "Septiembre", never mid-sentence)
// rather than lower-cased like the other two call sites need.
export const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export const HOME_COPY = {
  greeting: 'Hola, Ana',
  occupiedNightsTitle: 'Noches ocupadas',
  of: 'de',
  addReservation: 'Anotar una reserva',
} as const
