import { displayBalance } from '../reservations/displayBalance'
import type { ReservationDetail } from '../reservations/useReservations'

// tasks 7.7/7.8 and 7.9/7.10 -- one function, shared by `GuestDirectory`'s
// list row and `GuestSheet`'s detail sheet, so "how many stays does this
// guest have, and what does she owe" cannot drift into two counting rules.
// D30's own invalidation rule keys everything off `reservations()`/
// `reservation(id)`, but there is no per-guest key to invalidate --
// `useReservations()` returns the WHOLE tenant's list, and this function is
// where "whole list" becomes "this one guest's list".
//
// Cancelled stays are excluded here, structurally, rather than trusted to
// the caller: every list in this app filters them (D30), and a guest's
// combined balance is the one place a forgotten filter would silently
// re-count a cancelled stay's money. `displayBalance()` (4.17/4.18) is
// reused per stay before summing, exactly as the spec requires -- even
// though every stay here has already passed the `status !== 'cancelled'`
// filter, so `displayBalance()`'s own branch is always a no-op in practice.
// Keeping the call anyway means this function's own correctness does not
// depend on nothing upstream ever changing that filter -- the same
// defence-in-depth reasoning `displayBalance()`'s own module comment
// states for itself.
//
// Sorted by `check_in` ascending (D30: "every list sorts by check_in"),
// which is what makes `stays[VISIBLE_STAY_COUNT]` (7.9/7.10's overflow
// pointer) the correct "first overflowing stay" rather than an arbitrary
// one.
export type GuestSummary = {
  readonly balanceCentavos: number
  readonly stayCount: number
  readonly stays: readonly ReservationDetail[]
}

export function summarizeGuestStays(reservations: readonly ReservationDetail[], guestId: string): GuestSummary {
  const stays = reservations
    .filter((reservation) => reservation.clientId === guestId && reservation.status !== 'cancelled')
    .slice()
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))

  const balanceCentavos = stays.reduce(
    (sum, stay) => sum + displayBalance({ status: stay.status, balance: stay.balanceCentavos }),
    0,
  )

  return { balanceCentavos, stayCount: stays.length, stays }
}
