import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'

// task 7.14, the same soft-delete pattern 8.2 will reuse for cabins: `DELETE
// /clients/{id}` (`back/app/api/routers/clients.py::delete_client`) sets
// `deleted_at` and deletes no row -- the guest's reservations, payments and
// name all survive untouched, which is what makes 7.13's "past stays
// remain fully readable, named, afterward" true by construction rather
// than by a second guard here.
//
// `useQueryClient()`, not the module-level singleton -- `useReservationMutation.ts`'s
// own recorded reasoning applies unchanged: only the hook is guaranteed to
// invalidate the client the surrounding tree is actually reading from.
// Invalidates `keys.clients()` only: deactivating a guest changes nothing
// about any reservation's own data, so there is no `reservations()`/
// `dashboard()` entry this write could leave stale.

export type DeactivateGuestInput = {
  readonly guestId: string
}

export function useDeactivateGuest() {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, DeactivateGuestInput>({
    mutationFn: ({ guestId }) => apiRequest<void>(`/clients/${guestId}`, { method: 'DELETE' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.clients() })
    },
  })
}
