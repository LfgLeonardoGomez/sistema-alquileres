/**
 * The exact reverse of `parseMoney` -- integer centavos back to the API's
 * own `"5000.00"` decimal-string shape (D27).
 *
 * Lifted out of `app/reservations/useCreateReservation.ts` (task 5.20),
 * where it lived as a private one-call-site helper, at the moment task 6.8
 * gave it a SECOND call site (`useCreatePayment`). Two copies of a money
 * encoder is exactly the "second truth about money" D27/D30 keep naming,
 * and the negative branch is why: `Math.trunc` and `%` disagree about sign
 * on a negative, so `-1000000` centavos must produce `"-10000.00"` and not
 * `"-10000.-00"`. A refund is the first negative amount this app ever
 * sends, so that branch went from theoretical to load-bearing here.
 */
export function centavosToApiDecimalString(centavos: number): string {
  const pesos = Math.trunc(centavos / 100)
  const remainder = Math.abs(centavos % 100).toString().padStart(2, '0')
  // A negative amount smaller than one peso truncates to `0`, which would
  // print as `"0.50"` and silently flip a 50-centavo refund into a
  // 50-centavo payment. The sign is therefore taken from the input, never
  // from the truncated pesos.
  const sign = centavos < 0 && pesos === 0 ? '-' : ''
  return `${sign}${pesos}.${remainder}`
}
