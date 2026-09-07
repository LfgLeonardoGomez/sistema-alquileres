// design-handoff README.md, screen 08 ("Cabañas"): "'Mis cabañas' + two
// cards (dot, name 21px/800, '9 noches ocupadas este mes', 'Editar' link).
// Dashed 62px 'Agregar una cabaña'. Footnote: 'Si dejás de alquilar una, la
// desactivás y todo su historial queda guardado.' Nothing is ever deleted --
// deactivate only. No search (two items)." Every string below lifted from
// that drawing verbatim; only the two sheets it does not draw the body copy
// of (edit, deactivate confirmation) are this run's own minimal, same-
// register invention -- flagged where they appear, `GuestSheet.ts`'s own
// precedent for the identical situation.

export const CABIN_DIRECTORY_COPY = {
  title: 'Mis cabañas',
  addCabin: 'Agregar una cabaña',
  edit: 'Editar',
  footnote: 'Si dejás de alquilar una, la desactivás y todo su historial queda guardado.',
} as const

/** Screen 08's own literal example: "9 noches ocupadas este mes". Sourced
 * straight from `GET /dashboard/summary`'s per-property breakdown (D30,
 * `cabin-directory` spec) -- never a client-side recount over the
 * reservation list. */
export function occupiedNightsThisMonthLabel(nights: number): string {
  return `${nights} noches ocupadas este mes`
}

// The edit sheet (rename + the deactivate entry point). Not drawn as its own
// surface in the handoff -- screen 08 only shows the "Editar" link -- so
// this run invents the minimal same-register wrapper, `GuestSheet.tsx`'s own
// precedent for an undrawn "tap a row" surface.
export const CABIN_FORM_COPY = {
  nameLabel: 'Nombre',
  addSubmit: 'Agregar',
  renameSubmit: 'Guardar',
} as const

export const CABIN_EDIT_SHEET_COPY = {
  deactivate: 'Desactivar',
  close: 'Volver',
} as const

// Not drawn anywhere in the handoff (screen 08 shows only the "Editar" link,
// no confirmation body) -- this run's own minimal, same-register invention,
// on the footnote's own precedent for the identical soft-delete promise,
// and matching `DEACTIVATE_GUEST_SHEET_COPY`'s own shape (`copy/guests.ts`).
export const DEACTIVATE_CABIN_SHEET_COPY = {
  title: '¿Desactivás esta cabaña?',
  body: 'Sus reservas anteriores quedan guardadas, con su nombre.',
  confirm: 'Sí, desactivar',
  decline: 'No, dejarla como está',
} as const
