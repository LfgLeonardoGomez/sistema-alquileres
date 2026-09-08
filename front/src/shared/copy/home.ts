import { Temporal } from 'temporal-polyfill'
import type { PlainDate } from '../date/parsePlainDate'

// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 02 (Inicio) -- "deliberately empty": one occupancy card,
// one action, no revenue figure (home-summary spec "No Revenue Figure Is
// Ever Rendered", tasks 3.17/3.18). The handoff's own literal high-fidelity
// copy for this greeting was "Hola, Ana" -- a fictional owner's name. This
// app is multi-tenant, `tenants.name` is the BUSINESS name (never a
// person's), and `users` holds only an email -- there is no owner-person
// name anywhere in the schema for a greeting to use. The owner's own
// live-review rejection (Ana is not her aunt Andrea, and every tenant of
// this product saw the same wrong name) replaces it with a nameless,
// rotating greeting (`GREETING_PHRASES`/`greetingForDate` below) rather
// than inventing a name field this run was never asked to add.
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

/**
 * Five nameless, deliberately time-neutral phrases (never "Buen día" --
 * that would read wrong if she opens the app at night; time-of-day
 * awareness was considered and explicitly deferred). Order is fixed and
 * load-bearing: `greetingForDate` indexes into this array by position.
 */
export const GREETING_PHRASES = [
  'Hola, ¿cómo empezamos hoy?',
  'Hola, ¿qué hacemos hoy?',
  'Hola, ¿arrancamos?',
  'Hola, ¿qué anotamos hoy?',
  'Hola, ¿en qué andamos?',
] as const

/**
 * Picks the greeting for a given calendar date -- a PURE function of the
 * date, never random and never stateful (the binding constraint this run
 * was given): the same date always yields the same phrase, and it changes
 * only at midnight, not on every render/navigation back to Inicio.
 *
 * Takes an already-resolved `PlainDate` rather than reading "today" itself
 * (`HomeScreen.tsx`'s own `todayAR()` call supplies it) -- this module
 * never constructs a `Date` or calls `Temporal.Now` (design D26). Indexes
 * by `dayOfYear`, the same "three integers, no time, no zone" value a
 * `PlainDate` already carries; a Jan-1 rotation reset one year to the next
 * is not a problem worth engineering around for five phrases.
 */
export function greetingForDate(date: PlainDate): string {
  const dayOfYear = Temporal.PlainDate.from(date).dayOfYear
  const index = (dayOfYear - 1) % GREETING_PHRASES.length
  return GREETING_PHRASES[index]!
}
