import { RESERVATION_DETAIL_COPY } from '../../shared/copy/reservations'

// tasks 6.2 and 6.27 -- which sentence a balance gets, extracted so the
// edit screen's LIVE preview and the detail screen's SAVED reading are the
// same rule rather than two copies of it.
//
// D34's own reason for the preview existing at all: "The screen previews
// the resulting `Saldo` live through `displayBalance()`, so a negative
// result reads **`Le tenés que devolver $ 20.000`** BEFORE she saves rather
// than as a surprise after. That is a normal state, never an error." A
// preview that phrased the same number differently from the screen it is
// previewing would defeat the point.
//
// The amount itself is NOT part of this function: the two call sites render
// `formatMoney(Math.abs(balance))` beside the sentence, because
// `formatMoney(-2000000)` returns `"$ -20.000"` -- the sign landing between
// the symbol and the digits, which reads as an error rather than as money
// owed back (6.2's own finding). The direction is carried by the words.

/**
 * `Le falta pagar` when she is still owed money, `Le tenés que devolver`
 * when she is holding too much, and `null` at exactly zero -- nothing is
 * owed in either direction, so no directional line is rendered at all.
 *
 * That `null` is also the whole of 6.3/6.4: `displayBalance()` reports `0`
 * for a cancelled stay, so a cancelled reservation reaches this function's
 * zero branch and prints none of the three phrasings the spec forbids it.
 */
export function balanceLine(balanceCentavos: number): string | null {
  if (balanceCentavos > 0) return RESERVATION_DETAIL_COPY.owes
  if (balanceCentavos < 0) return RESERVATION_DETAIL_COPY.refundOwed
  return null
}
