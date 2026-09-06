// tasks 5.22/5.23 and 6.24/6.25 -- the rescale rule, extracted so the edit
// screen REUSES it rather than writing a second copy of the same
// multiplication.
//
// Design D34: "Changing dates on a per-night stay recomputes the total live
// using the same formula as `effective_total`... Changing dates on a
// stay-total stay shows the total unchanged with a line saying so."
// `reservation-ledger`'s own spec says the same in fewer words: editing
// rescales "following the same rule as `reservation-recording`."
//
// It lived inline in `wizard/PriceStep.tsx` while there was exactly one
// call site (5.23). The edit screen is the second, and this project has
// already paid once for a rule that existed twice and drifted into two
// spellings (`nightsBetween`, extracted at 6.15 for the same reason). One
// function, one truth about what a stay costs.
//
// This mirrors `back/app/services/reservations.py::effective_total`, which
// is the server's own authority -- the client recomputes it here ONLY to
// preview an unsaved edit. Everything already saved is read straight off
// the API's `effective_total` (`ReservationDetail.tsx`), never recomputed.

export type PriceMode = 'per_night' | 'total'

/**
 * What the stay costs in total: a per-night amount multiplied by the
 * nights, or a stay total taken exactly as entered. A stay total is never
 * multiplied by anything, which is the whole of why a date change moves one
 * and not the other.
 */
export function effectiveTotalCentavos(priceMode: PriceMode, amountCentavos: number, nights: number): number {
  return priceMode === 'per_night' ? amountCentavos * nights : amountCentavos
}
