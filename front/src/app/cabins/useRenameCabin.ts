import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'
import type { Cabin } from '../reservations/useCabins'

// task 8.7/8.8, `PATCH /properties/{id}` (`back/app/api/routers/properties.py::update_property`).
// Invalidates ONLY `keys.cabins()` -- `useDeactivateGuest.ts`'s own
// reasoning applies unchanged: a rename changes nothing about any
// reservation's own data, so there is no `reservations()`/`dashboard()`
// entry this write could leave stale. This IS the mechanism the trap test
// (`CabinDirectory.test.tsx`) proves: `ReservationDetail.tsx` resolves its
// cabin's name live via `useCabins()` (never a snapshot on the reservation
// itself), so invalidating `cabins()` here is the whole fix -- no
// reservation record is touched, and none needs to be.

export type RenameCabinInput = {
  readonly cabinId: string
  readonly name: string
}

export function useRenameCabin() {
  const queryClient = useQueryClient()

  return useMutation<Cabin, ApiError, RenameCabinInput>({
    mutationFn: ({ cabinId, name }) =>
      apiRequest<Cabin>(`/properties/${cabinId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.cabins() })
    },
  })
}
