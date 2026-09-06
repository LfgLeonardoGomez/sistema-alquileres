// design D32 + handoff screens 04 ("paso 2 de 4") and 05 ("paso 4 de 4").
// Steps 1 (cabaña) and 3 (huésped) are not drawn anywhere in the handoff --
// their copy below is this run's own minimal, same-register invention, not
// lifted from any screen, flagged here rather than silently presented as
// drawn.

export const RESERVATION_WIZARD_COPY = {
  dateStepTitle: '¿Qué noches?',
  priceStepTitle: '¿Cuánto le cobrás?',
  seguir: 'Seguir',
  guardar: 'Guardar la reserva',
  volver: 'Volver',
  perNight: 'Por noche',
  total: 'Total de la estadía',
  amountLabel: 'Monto',
  entradaLabel: 'Entrada',
  salidaLabel: 'Salida',
  nightSingular: 'noche',
  nightPlural: 'noches',
  previousMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  previousMonthGlyph: '‹',
  nextMonthGlyph: '›',
  zeroNightsGuard: 'Elegí al menos una noche.',
  tooManyNightsGuard: 'Elegí un rango de hasta 60 noches.',
  resumenLabel: 'resumen',
} as const

export function wizardStepLabel(step: number): string {
  return `Paso ${step} de 4`
}

export function occupiedNightsBanner(cabinName: string): string {
  return `${cabinName} · las noches en gris ya están ocupadas`
}

export function nightsCountLabel(nights: number): string {
  const word = nights === 1 ? RESERVATION_WIZARD_COPY.nightSingular : RESERVATION_WIZARD_COPY.nightPlural
  return `${nights} ${word}`
}

export function dateRangeContextBanner(cabinName: string, formattedRange: string, nights: number): string {
  return `${cabinName} · del ${formattedRange} · ${nightsCountLabel(nights)}`
}

export function rescaleHelper(nights: number, perNightAmountFormatted: string): string {
  const word = nights === 1 ? RESERVATION_WIZARD_COPY.nightSingular : RESERVATION_WIZARD_COPY.nightPlural
  return `Se calcula solo: ${nights} ${word} × ${perNightAmountFormatted}. Si después estirás las fechas, se vuelve a calcular.`
}
