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
  // Owner's live-review rejection of the occupancy card above (2026-09-07):
  // "no sé si eso me sirve ahí" -- replaced by one row per cabin naming
  // that cabin's own next arrival, refined twice: "no me des todo el
  // historial de quien viene, solo el próximo que viene a cada
  // casa/cabaña." Not drawn in the handoff (screen 02 predates this
  // request), so every string below is this run's own invention, matching
  // this file's own established register.
  upcomingArrivalsTitle: 'Próximas llegadas',
  noUpcomingArrival: 'Sin reservas próximas',
  arrivalToday: 'hoy',
  arrivalTomorrow: 'mañana',
  // Owner's own framing (2026-09-07): "le piden estadía del 1/1 al 8/1,
  // tiene que revisar una por una las casas para ver si las tiene
  // disponibles" -- her most frequent action, placed above "Próximas
  // llegadas" (the less frequent one) for exactly that reason. Reuses the
  // wizard's own "Entrada"/"Salida" wording (`shared/copy/reservations.ts`)
  // as its own literal strings rather than a cross-file import -- this
  // file's own established rule for `MONTH_LABELS` above applies the same
  // way here.
  availabilityTitle: 'Disponibilidad',
  availabilityEntradaLabel: 'Entrada',
  availabilitySalidaLabel: 'Salida',
  availabilityHint: 'Elegí las dos fechas para ver qué casas están libres.',
  availabilityInvalidRange: 'La salida tiene que ser posterior a la entrada.',
  availabilityLoading: 'Buscando…',
  availabilityFree: 'Libre',
  availabilityOccupied: 'Ocupada',
  availabilityNoneFree: 'Ninguna casa está libre en esas fechas.',
} as const

/**
 * `"3 de 4 libres"` -- a glance-level summary above the per-cabin list, so
 * "which cabins are free" reads as one sentence, not a count she has to do
 * herself by scanning every row. Falls back to the explicit
 * `availabilityNoneFree` sentence when the count is zero -- "0 de 4 libres"
 * reads like a fragment of a stat, not the clear statement the owner asked
 * for ("o si ninguna tiene").
 */
export function availabilitySummary(freeCount: number, totalCount: number): string {
  if (freeCount === 0) return HOME_COPY.availabilityNoneFree
  return `${freeCount} de ${totalCount} libres`
}

/**
 * Chooses between "hoy"/"mañana" and a plain `D/M` date for an arrival row.
 * Takes the day-count and the already-formatted date as plain values (the
 * same "copy decides the wording, a date/money module only computes"
 * boundary `rescaleHelper`/`moneyStillHeldReminder` already use) -- this
 * function has no idea what a `PlainDate` or a `Temporal` object is.
 */
export function arrivalDateLabel(daysUntilArrival: number, formattedDayMonth: string): string {
  if (daysUntilArrival === 0) return HOME_COPY.arrivalToday
  if (daysUntilArrival === 1) return HOME_COPY.arrivalTomorrow
  return formattedDayMonth
}
