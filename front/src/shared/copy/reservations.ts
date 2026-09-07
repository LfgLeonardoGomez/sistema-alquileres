// design D32 + handoff screens 04 ("paso 2 de 4") and 05 ("paso 4 de 4").
// Steps 1 (cabaña) and 3 (huésped) are not drawn anywhere in the handoff --
// their copy below is this run's own minimal, same-register invention, not
// lifted from any screen, flagged here rather than silently presented as
// drawn.

export const RESERVATION_WIZARD_COPY = {
  // Step 1 (cabaña) is not drawn in the handoff either -- see this
  // module's header comment. Added per the owner's live-review correction
  // #3 (2026-09-07): "veo una pantalla limpia, sin nada más que dos
  // botones largos, no me gusta" -- a heading was missing above the two
  // choices. Written as a question, matching `dateStepTitle`/
  // `priceStepTitle`'s own register.
  cabinStepTitle: '¿Para qué casa querés reservar?',
  dateStepTitle: '¿Qué noches?',
  priceStepTitle: '¿Cuánto le cobrás?',
  seguir: 'Seguir',
  guardar: 'Guardar la reserva',
  volver: 'Volver',
  perNight: 'Por noche',
  total: 'Total de la estadía',
  amountLabel: 'Monto',
  // Screen 05's own literal amount-field prefix ("$" 28px muted, before the
  // typed value) -- `react/jsx-no-literals` (D32) forbids a bare `"$"` in
  // JSX, so it lives here like every other on-screen string.
  currencySymbol: '$',
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
  // Owner's live-review request (2026-09-07): "no me da la opción de anotar
  // el monto que el cliente me pagó como seña de la reserva" -- an optional
  // field on this same step, so a stay can be recorded with its deposit in
  // one pass instead of a second trip through the guest directory. Not
  // drawn in the handoff (screen 05 predates this request), so this label
  // is this run's own invention, matching screen 06's own already-approved
  // word for the same concept ("12/8 · seña — $ 60.000").
  depositLabel: 'Seña (opcional)',
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
  // Owner's live-review request (2026-09-07), the partial-failure half: the
  // wizard chains "create the stay" then "record its deposit" as two
  // separate API calls (the backend has no single endpoint for both) -- if
  // the first succeeds and the second fails, she lands here instead of
  // losing the stay. Written to name what already happened (saved) before
  // what didn't (the deposit), so it never reads as the reservation itself
  // having failed.
  depositNotRecorded: 'Guardamos la reserva, pero no pudimos anotar la seña. Anotala acá abajo.',
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

// --- Phase 6b: editing a saved reservation (screen not drawn) -----------
//
// Design D34. Editing entered scope by the owner's own decision after the
// proposal was written, so the handoff draws no edit screen at all -- every
// string below is this run's own invention, flagged here rather than
// silently presented as drawn, and written to the register of the strings
// above it. The picker chrome, the price control and the money labels are
// deliberately NOT re-invented here: the edit screen imports
// `RESERVATION_WIZARD_COPY` and `RESERVATION_DETAIL_COPY` for those, so
// `Por noche`, `Monto`, `Saldo` and `Le tenés que devolver` have exactly one
// spelling each in the whole app.
export const RESERVATION_EDIT_COPY = {
  title: 'Cambiar las noches o el precio',
  guardar: 'Guardar los cambios',
} as const

/**
 * Joins already-formatted day/month strings the way a person writes a list:
 * `el 9/9`, `el 9/9 y el 10/9`, `el 9/9, el 10/9 y el 11/9`. Takes the
 * strings already rendered by `formatDayMonth`, never dates -- this module
 * goes on knowing nothing about how a date is spelled, exactly as it knows
 * nothing about how money is.
 */
export function nightListPhrase(formattedNights: readonly string[]): string {
  const withArticle = formattedNights.map((night) => `el ${night}`)
  if (withArticle.length <= 1) return withArticle.join('')
  return `${withArticle.slice(0, -1).join(', ')} y ${withArticle[withArticle.length - 1]}`
}

/**
 * D32's resolution step 1, made real: "A call site may pass a more specific
 * sentence for a specific `code` -- the same `409 dates_unavailable` reads
 * differently in the wizard than on the edit screen."
 *
 * The wizard's version is the generic table row ("Esas noches ya están
 * ocupadas. Elegí otras."), which is all it can say: a new stay has no
 * nights of its own to compare against. An EDIT has a specific range she
 * just asked for, so this one names the cabin and tells her which of those
 * nights survived -- the difference between "try again" and "try again from
 * the 9th".
 *
 * `freeNights` arrives already formatted and already joined, so the whole
 * of what this function does is choose between two sentences.
 */
export function editDatesUnavailable(cabinName: string, freeNights: string | null): string {
  if (freeNights === null) return `${cabinName} ya está ocupada todas esas noches. Elegí otras.`
  return `${cabinName} ya está ocupada esas noches. De las que elegiste, todavía están libres ${freeNights}.`
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
