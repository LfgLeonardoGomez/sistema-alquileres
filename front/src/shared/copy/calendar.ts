// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's screen 03 (Calendario de reservas). Reused as-is by
// `WhoStays.tsx` and `CalendarScreen.tsx` (tasks 4.13-4.28).
//
// `emptyMonth` is the handoff's own literal copy, already reused by
// `PlaceholderScreens.tsx`'s stand-in `CalendarPlaceholder` (task 3.23,
// `shared/copy/shell.ts`) -- duplicated here rather than imported from that
// module, the same "colocated per surface" tradeoff `public.ts`'s own note
// takes for its duplicated month names: this module is the reservation
// calendar's OWN surface file, and `shell.ts`'s copy is a stand-in for a
// screen that, as of this phase, is no longer a stand-in.
export const CALENDAR_COPY = {
  cabinFilterLabel: 'Elegí una cabaña',
  whoStaysTitle: 'Quién se queda',
  emptyMonth: 'Todavía no anotaste ninguna reserva en este mes',
  addReservation: 'Anotar una reserva',
  debePrefix: 'Debe',
  paid: 'Pagado',
  night: 'noche',
  nights: 'noches',
} as const
