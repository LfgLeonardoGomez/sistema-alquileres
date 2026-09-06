// design D32 (copy lives in `shared/copy/**`, glossary-tested) + the
// handoff's own "Interactions & Behavior" section: "Tab bar navigation
// between Inicio / Calendario / Huéspedes / Cabañas; everything daily is
// one tap away" and "Empty states must instruct, not sit blank".
//
// `calendarEmpty`/`guestsEmpty` are the handoff's own literal copy, reused
// here (task 3.23) as the stand-in content for these three tabs' screens,
// which are not built until Phases 4/7/8 -- they are not invented text, and
// they happen to describe the same "nothing recorded yet" state a freshly
// built screen would also show on day one. `cabinsEmpty` has no handoff
// precedent (screen 08 always shows exactly two fixed cabins and states
// "No search (two items)" -- a true zero-cabin state is never expected in
// production), so this line is a new sentence in the same register and verb
// pattern as `guestsEmpty` ("Acá van a aparecer..."), flagged here as an
// assumption rather than invented silently.

export const SHELL_COPY = {
  tabBarLabel: 'Navegación principal',
  tabInicio: 'Inicio',
  tabCalendario: 'Calendario',
  tabHuespedes: 'Huéspedes',
  tabCabanas: 'Cabañas',
  calendarEmpty: 'Todavía no anotaste ninguna reserva en este mes',
  guestsEmpty: 'Acá van a aparecer las personas que se quedaron',
  cabinsEmpty: 'Acá van a aparecer tus cabañas',
} as const
