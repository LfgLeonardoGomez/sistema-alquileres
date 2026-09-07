import { useCabins } from '../reservations/useCabins'
import { useClients } from '../reservations/useClients'
import { useReservations, type ReservationDetail } from '../reservations/useReservations'
import { todayAR } from '../../shared/date/todayAR'
import type { PlainDate } from '../../shared/date/parsePlainDate'

// home-arrivals: owner's live-review rejection of the "Noches ocupadas"
// card (2026-09-07): "no sé si eso me sirve ahí" -- a number she cannot
// act on. Replaced by ONE ROW PER CABIN, showing that cabin's own next
// arrival, refined twice in her own words: "no me des todo el historial de
// quien viene, solo el próximo que viene a cada casa/cabaña."
//
// Rows are driven by the cabins that exist (`useCabins()`, D30's one
// lookup call site for `/properties`), not by the reservations found -- a
// cabin with nothing booked still gets its own row (an empty one), because
// a missing row would be ambiguous between "free" and "broken", and an
// empty cabin at a glance is exactly the point. Deactivated cabins are
// filtered out here rather than at the fetch: `useCabins()` stays the ONE
// call site fetching `include_inactive=true` (the guest-directory/cabin-
// directory screens still need every cabin to resolve a past stay's name),
// but a cabin nobody can book going forward has no "next arrival" worth a
// row on this card.
//
// "Next" counts strictly from today FORWARD (`checkIn >= today`) -- a
// guest already staying (check-in in the past, check-out still ahead) must
// NOT appear; the next one after them does. This is why the WHOLE,
// unfiltered reservation list (`useReservations()`, the guest-directory's
// own precedent for "no per-endpoint aggregate exists, compute client-
// side") is reused here instead of the backend's own `from`/`to` window:
// that window filters by OVERLAP (`app/api/routers/reservations.py`'s
// `daterange && daterange` expression), which would incorrectly include an
// in-progress stay whose check-in is before the window's own start.
// Filtering client-side on `checkIn` alone is the only shape that matches
// the rule as the owner stated it. Cancelled reservations are excluded the
// same way `displayBalance()`/`balanceLine()` already treat a cancelled
// stay everywhere else in this app -- never a candidate for "next".
export type UpcomingArrivalRow = {
  readonly cabinId: string
  readonly cabinName: string
  readonly guestName: string | null
  readonly checkIn: PlainDate | null
}

function findSoonest(
  reservations: readonly ReservationDetail[] | undefined,
  cabinId: string,
  today: PlainDate,
): ReservationDetail | null {
  let soonest: ReservationDetail | null = null
  for (const reservation of reservations ?? []) {
    if (reservation.propertyId !== cabinId) continue
    if (reservation.status === 'cancelled') continue
    if (reservation.checkIn < today) continue
    if (soonest === null || reservation.checkIn < soonest.checkIn) soonest = reservation
  }
  return soonest
}

export function useUpcomingArrivals() {
  const cabins = useCabins()
  const clients = useClients()
  const reservations = useReservations()
  const today = todayAR()

  const rows: readonly UpcomingArrivalRow[] = (cabins.data ?? [])
    .filter((cabin) => cabin.is_active)
    .map((cabin) => {
      const next = findSoonest(reservations.data, cabin.id, today)
      const guestName = next === null ? null : (clients.data?.find((client) => client.id === next.clientId)?.full_name ?? null)
      return {
        cabinId: cabin.id,
        cabinName: cabin.name,
        guestName,
        checkIn: next?.checkIn ?? null,
      }
    })

  return {
    rows,
    isLoading: cabins.isLoading || clients.isLoading || reservations.isLoading,
  }
}
