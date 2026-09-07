import { useQuery } from '@tanstack/react-query'
import { Temporal } from 'temporal-polyfill'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import { monthWindow, type YearMonth } from '../../shared/calendar/monthGrid'
import { todayAR } from '../../shared/date/todayAR'

// task 8.9/8.10, `cabin-directory` spec: "The 'N noches ocupadas este mes'
// figure on each cabin card MUST come from `GET /dashboard/summary`'s
// per-property breakdown for the current month window, not from a
// separately recomputed count over the reservation list." `keys.dashboard()`
// is the SAME key `useCreateReservation.ts`/`useReservationMutation.ts`
// already invalidate on every reservation/payment write (D30's own
// invalidation table), so this card refreshes automatically the moment a
// stay is recorded, edited, cancelled, paid or refunded -- no separate
// invalidation wired here.
//
// Narrow, hand-written response type (D35's decode-boundary convention,
// `HomeScreen.tsx`'s own `DashboardOccupancy` precedent): `collected` is
// structurally absent, the same way `ApiError` structurally has no
// `detail` (D32) -- this screen has no business reading revenue, and there
// is no code path here that could.
export type PropertyOccupancy = {
  readonly property_id: string
  readonly occupied_nights: number
  readonly available_nights: number
}

type DashboardSummaryResponse = {
  readonly occupied_nights: number
  readonly available_nights: number
  readonly properties: readonly PropertyOccupancy[]
}

function currentYearMonth(): YearMonth {
  const today = Temporal.PlainDate.from(todayAR())
  return { year: today.year, month: today.month }
}

export function useDashboardSummary() {
  const { start, end } = monthWindow(currentYearMonth())
  return useQuery({
    queryKey: keys.dashboard(),
    queryFn: () => apiRequest<DashboardSummaryResponse>(`/dashboard/summary?from=${start}&to=${end}`),
  })
}

/** Looks up one cabin's occupied-nights figure in the dashboard's
 * per-property breakdown -- `0` when the property has no entry yet (a
 * brand-new cabin with no reservations this month), never a client-side
 * recount over any reservation list. */
export function occupiedNightsFor(properties: readonly PropertyOccupancy[] | undefined, cabinId: string): number {
  return properties?.find((property) => property.property_id === cabinId)?.occupied_nights ?? 0
}
