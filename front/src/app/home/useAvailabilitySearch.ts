import { Temporal } from 'temporal-polyfill'
import { occupiedNightsFor } from '../reservations/occupancy'
import { useCabins } from '../reservations/useCabins'
import { useReservations } from '../reservations/useReservations'
import { isRangeLegal } from '../reservations/wizard/RangePickerCalendar'
import type { PlainDate } from '../../shared/date/parsePlainDate'

// Owner's own words (2026-09-07): "le piden estadía del 1/1 al 8/1, tiene
// que revisar una por una las casas para ver si las tiene disponibles" --
// this hook is the "revisar una por una" step, done once for every cabin
// instead of by hand.
//
// The half-open occupancy rule ("a range may end on a day another stay
// starts", design D28) is NOT reimplemented here as a second overlap test.
// `RangePickerCalendar.tsx`'s own `isRangeLegal` -- exported for exactly
// this reason, per its own doc comment -- already decides "is every night
// STRICTLY INSIDE `[entrada, salida)` free", checked against the same
// `occupiedNightsFor` set the create wizard's `DateStep.tsx` builds. Reusing
// both means a stay that checks OUT on the query's entrada, or checks IN on
// the query's salida, is free here for the exact same reason it is a legal
// selection there -- one rule, one place it is coded.
//
// `GET /reservations`'s own `from`/`to` filter is deliberately NOT used
// (task brief: "its filter is overlap-based ... NOT a containment filter").
// `useReservations()` -- the guest-directory's own "no per-endpoint
// aggregate, fetch the whole list, compute client-side" precedent -- is
// reused instead, so this hook adds no second network call beyond what
// `UpcomingArrivals` already makes on this same screen (identical
// `useCabins()`/`useReservations()` query keys, deduped by TanStack Query).
export type AvailabilityRow = {
  readonly cabinId: string
  readonly cabinName: string
  readonly isFree: boolean
}

export type AvailabilitySearchResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'invalid-range' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly rows: readonly AvailabilityRow[] }

function isValidRange(from: PlainDate, to: PlainDate): boolean {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(to), Temporal.PlainDate.from(from)) > 0
}

export function useAvailabilitySearch(from: PlainDate | null, to: PlainDate | null): AvailabilitySearchResult {
  const cabins = useCabins()
  const reservations = useReservations()

  if (from === null || to === null) return { kind: 'idle' }
  if (!isValidRange(from, to)) return { kind: 'invalid-range' }
  if (cabins.isLoading || reservations.isLoading) return { kind: 'loading' }

  // D30: cancelled stays are filtered out of every occupancy computation,
  // the same gate `DateStep.tsx`/`useUpcomingArrivals.ts` already apply.
  const activeStays = (reservations.data ?? []).filter((reservation) => reservation.status !== 'cancelled')

  // Every cabin the tenant has is accounted for (deactivated cabins
  // excluded, `useUpcomingArrivals.ts`'s own precedent: nothing can book a
  // cabin no longer offered, so it has no "free/occupied" answer worth a
  // row here either).
  const rows: readonly AvailabilityRow[] = (cabins.data ?? [])
    .filter((cabin) => cabin.is_active)
    .map((cabin) => {
      const cabinStays = activeStays.filter((stay) => stay.propertyId === cabin.id)
      const occupiedNights = occupiedNightsFor(
        cabinStays.map((stay) => ({ id: stay.id, checkIn: stay.checkIn, checkOut: stay.checkOut })),
        { excludeReservationId: null },
      )
      return { cabinId: cabin.id, cabinName: cabin.name, isFree: isRangeLegal(from, to, occupiedNights) }
    })

  return { kind: 'ready', rows }
}
