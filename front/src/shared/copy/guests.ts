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
