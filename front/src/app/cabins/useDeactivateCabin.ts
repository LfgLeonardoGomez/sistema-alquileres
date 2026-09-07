import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'

// task 8.1/8.2, the same soft-delete pattern `useDeactivateGuest.ts` (7.14)
// already established: `DELETE /properties/{id}`
// (`back/app/api/routers/properties.py::delete_property`) sets
// `deleted_at` and deletes no row -- a cabin's reservations and name both
// survive untouched, which is what makes 8.1's "past reservations remain
// fully readable, with the cabin's name still resolvable" true by
// construction rather than by a second guard here.
//
// `useQueryClient()`, not the module-level singleton -- `useReservationMutation.ts`'s
// own recorded reasoning applies unchanged. Invalidates `keys.cabins()`
// only, on the identical reasoning `useDeactivateGuest.ts` already recorded
// for guests: deactivating a cabin changes nothing about any reservation's
// own data.

export type DeactivateCabinInput = {
  readonly cabinId: string
}

export function useDeactivateCabin() {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, DeactivateCabinInput>({
    mutationFn: ({ cabinId }) => apiRequest<void>(`/properties/${cabinId}`, { method: 'DELETE' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.cabins() })
    },
  })
}
