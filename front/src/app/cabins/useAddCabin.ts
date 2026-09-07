import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'
import type { Cabin } from '../reservations/useCabins'

// task 8.2, `POST /properties` (`back/app/api/routers/properties.py::create_property`),
// the create half of the cabin directory's three writes. Invalidates BOTH
// `keys.cabins()` (a new cabin the lookup hasn't fetched yet) AND
// `keys.dashboard()` -- unlike rename/deactivate (`useRenameCabin.ts`/
// `useDeactivateCabin.ts`, which invalidate only `cabins()` on
// `useDeactivateGuest.ts`'s own reasoning that a name-only or active-flag
// change touches no reservation/aggregate data), a brand-new cabin is a
// brand-new row in `GET /dashboard/summary`'s per-property breakdown (task
// 8.9/8.10) that would otherwise sit stale at "not present" until some
// unrelated reservation mutation happened to refresh it.

export type AddCabinInput = {
  readonly name: string
}

export function useAddCabin() {
  const queryClient = useQueryClient()

  return useMutation<Cabin, ApiError, AddCabinInput>({
    mutationFn: ({ name }) =>
      apiRequest<Cabin>('/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.cabins() })
      void queryClient.invalidateQueries({ queryKey: keys.dashboard() })
    },
  })
}
