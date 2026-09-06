import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'

// design D30: "One hook each for cabins and guests, both fetching with
// include_inactive=true." This is the ONE call site for `/properties`
// (task 4.10's standing regression guard) -- a deactivated cabin's stays
// must still resolve a name (`reservation-calendar` spec), so the lookup
// is never filtered.
//
// Narrow, hand-written response type per D35's decode-boundary convention
// (matching `HomeScreen.tsx`'s own `DashboardOccupancy`) rather than
// importing `components["schemas"]["PropertyRead"]` wholesale from the
// generated file -- no date/money field needs branding here, but the
// convention of declaring only the fields this tree actually reads still
// holds.
export type Cabin = {
  readonly id: string
  readonly name: string
  readonly is_active: boolean
}

export function useCabins() {
  return useQuery({
    queryKey: keys.cabins(),
    queryFn: () => apiRequest<Cabin[]>('/properties?include_inactive=true'),
  })
}
