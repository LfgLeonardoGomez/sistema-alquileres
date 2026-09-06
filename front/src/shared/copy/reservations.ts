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

// --- Screen 06 (la reserva, detalle) + screen 07 (cancelar) -------------
//
// design D32. Screens 06 and 07 ARE drawn in the handoff, so every string
// below is lifted from it verbatim rather than invented -- including the
// two directional balance lines, whose exact wording is the point ("If the
// balance is negative the same block must read 'Le tenés que devolver' --
// a normal state, never an error"). The two exceptions, flagged rather
// than silently presented as drawn: `editar` (screen 06 draws no edit
// affordance at all -- editing entered scope by the owner's own decision
// after the proposal was written) and the "Anotar un pago"/"Devolución"
// sheets' field labels, which the handoff names as sheets but never draws.
export const RESERVATION_DETAIL_COPY = {
  entrada: 'Entrada',
  salida: 'Salida',
  noches: 'Noches',
  totalLabel: 'Total de la estadía',
  paidLabel: 'Pagado',
  saldoLabel: 'Saldo',
  owes: 'Le falta pagar',
  refundOwed: 'Le tenés que devolver',
  paymentsTitle: 'Pagos',
  noPayments: 'Todavía no anotaste ningún pago',
  recordPayment: 'Anotar un pago',
  refund: 'Devolución',
  cancel: 'Cancelar',
  editar: 'Editar la reserva',
  volver: 'Volver',
  amountLabel: 'Monto',
  methodLabel: 'Cómo',
  methodCash: 'Efectivo',
  methodTransfer: 'Transferencia',
  methodOther: 'Otro',
  noteLabel: 'Nota',
  guardar: 'Guardar',
} as const

export const CANCEL_SHEET_COPY = {
  title: '¿Cancelás esta reserva?',
  confirm: 'Sí, cancelar',
  decline: 'No, dejarla como está',
} as const

/**
 * Screen 07's body, verbatim: "Las noches del 3 al 7 de septiembre en Casa
 * Azul quedan libres para otra persona. Los pagos anotados quedan
 * guardados." `formattedRange` is `formatDateRange()`'s own entrada-to-
 * salida rendering -- never a minus-one-day "last night" adjustment (D26).
 */
export function cancelConfirmationBody(formattedRange: string, cabinName: string): string {
  return `Las noches del ${formattedRange} en ${cabinName} quedan libres para otra persona. Los pagos anotados quedan guardados.`
}

// --- Phase 6c: a cancelled stay that still holds money -------------------
//
// Task 6.33, and the owner's own decision of 2026-09-06: "que la
// cancelación deje registrar devoluciones, pero que no sea obligatorio,
// que sea mas como un mensaje recordatorio que como una obligacion".
//
// Not drawn in the handoff -- screen 07 ends at the confirmation -- so this
// sentence is this run's own invention, flagged here rather than silently
// presented as drawn, and written to the same register as the strings
// above it. Deliberately NOT one of the two directional balance lines: it
// says what she ALREADY took in, never what anyone owes, so a cancellation
// still never reads as a debt (6.3/6.4's rule, which `displayBalance()`
// keeps carrying untouched).
//
// The second sentence is conditional on purpose -- "si se los devolvés",
// not "devolveselos". Recording the refund is never mandatory and nothing
// on the screen waits for it.

/**
 * `formattedAmount` arrives ALREADY formatted (`$ 100.000`), never as
 * centavos: `formatMoney` stays the app's single formatter, and this
 * module goes on knowing nothing about how money is spelled.
 */
export function moneyStillHeldReminder(formattedAmount: string): string {
  return `Esta reserva está cancelada y todavía tenés ${formattedAmount} cobrados. Si se los devolvés, anotalo acá.`
}
