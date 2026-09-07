import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import { decodeReservationDetail, type ApiReservation, type ReservationDetail } from './useReservation'

// task 7.7/7.8, `guest-directory` spec: "no per-guest aggregate endpoint
// exists" (`back/app/schemas/client.py`'s own D47 note confirms it), so a
// guest's stay count and balance are computed client-side from "the
// reservation list" -- the whole list, unfiltered, the same incidental-
// plumbing shape 4.14's `useReservationsForCabin` established for a single
// cabin's stays. `GET /reservations` with no query param at all is a real,
// already-exercised path: `EditReservation.test.tsx`'s own
// `cabinStaysHandler` matches this exact bare path (MSW matches on path,
// not query string), and the backend's own `list_reservations` treats
// `property_id`/`client_id` as optional filters -- omitting both returns
// every reservation in the tenant, which is exactly what a directory-wide
// aggregate needs.
//
// Decoded through `useReservation.ts`'s own exported `decodeReservationDetail`
// rather than a third hand-written copy of the same `Decimal`-as-string/
// date-branding boundary `useReservationsForCabin.ts` already duplicates
// once -- this hook needs the full shape (cabin, dates, price, balance),
// not the narrower `ReservationForCalendar` slice, because the guest
// detail sheet (7.9-7.12) renders a stay row from it directly.
export type { ReservationDetail }

export function useReservations() {
  return useQuery({
    queryKey: keys.reservations(),
    queryFn: async () => {
      const raw = await apiRequest<ApiReservation[]>('/reservations')
      return raw.map(decodeReservationDetail)
    },
  })
}
