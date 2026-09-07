// design D32 + D33 ("the interface must not swallow that [200-vs-201]").
// Step 3 is not drawn anywhere in the handoff -- this run's own minimal,
// same-register invention, not lifted from any screen.

export const GUESTS_COPY = {
  guestStepTitle: '¿Quién se queda?',
  nameLabel: 'Nombre',
  phoneLabel: 'Teléfono',
  search: 'Buscar',
  seguir: 'Seguir',
} as const

/**
 * D33's exact required sentence, with the API's own returned name
 * interpolated -- never the name she typed. "Ese teléfono ya es de Marta
 * González." for the design's own literal example.
 */
export function guestPhoneBelongsToAnotherMessage(existingFullName: string): string {
  return `Ese teléfono ya es de ${existingFullName}.`
}

// --- Phase 7: the guest directory, handoff screens 09 and 10 ------------
//
// Screen 09 is drawn: title, search field, rows ("11 2233 4455 · 3
// estadías", right-aligned "Debe $ 80.000" when owed, a deactivated row
// reading grey "Desactivado · 1 estadía"), primary "Agregar un huésped".
// Every string below is lifted from that drawing verbatim.
export const GUEST_DIRECTORY_COPY = {
  title: 'Huéspedes',
  searchLabel: 'Buscar por nombre o teléfono',
  addGuest: 'Agregar un huésped',
  inactiveTag: 'Desactivado',
} as const

/** `1 estadía` / `2 estadías` -- same singular/plural shape as
 * `reservations.ts`'s own `nightsCountLabel`, spelled for guests instead of
 * nights rather than sharing that function across two unrelated nouns. */
export function guestStayCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'estadía' : 'estadías'}`
}

/** Screen 09's own literal example: "Debe $ 80.000". `formattedAmount`
 * arrives already formatted, on `balanceLine.ts`'s own convention -- this
 * module goes on knowing nothing about how money is spelled. */
export function guestOwesLabel(formattedAmount: string): string {
  return `Debe ${formattedAmount}`
}

// Screen 10 (the guest detail sheet).
export const GUEST_SHEET_COPY = {
  saldoLabel: 'Saldo',
  staysTitle: 'Sus estadías',
  addReservation: 'Anotarle una reserva',
  deactivate: 'Desactivar',
  close: 'Volver',
} as const

/** Screen 10's own literal example: "y 1 estadía más en febrero". */
export function stayOverflowLine(count: number, monthName: string): string {
  return `y ${count} ${count === 1 ? 'estadía' : 'estadías'} más en ${monthName}`
}

// Not drawn anywhere in the handoff (screen 10 shows only the "Desactivar"
// link, no confirmation body) -- this run's own minimal, same-register
// invention, on screen 08's own precedent for the identical soft-delete
// promise ("Si dejás de alquilar una, la desactivás y todo su historial
// queda guardado.").
export const DEACTIVATE_GUEST_SHEET_COPY = {
  title: '¿Desactivás a este huésped?',
  body: 'Sus estadías anteriores quedan guardadas, con su nombre.',
  confirm: 'Sí, desactivar',
  decline: 'No, dejarlo como está',
} as const
