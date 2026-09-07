import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'
import type { Client } from '../reservations/useClients'

// Phase 7b (owner-waived TDD, 2026-09-06, `decisions/guest-edit-untested`):
// `PATCH /clients/{client_id}` (`back/app/api/routers/clients.py::update_client`,
// `ClientUpdate` schema -- `full_name`/`phone`/`email`/`national_id`, all
// optional). Confirmed against the generated `schema.gen.ts`
// (`update_client_clients__client_id__patch`), not guessed.
//
// `useQueryClient()`, not the module-level singleton -- `useReservationMutation.ts`'s
// and `useDeactivateGuest.ts`'s own recorded reasoning applies unchanged:
// only the hook is guaranteed to invalidate the client the surrounding tree
// is ACTUALLY reading from. This is the exact bug Phase 7 found and fixed
// in `useFindOrCreateGuest.ts` -- not reintroduced here.
//
// `onSettled`, not `onSuccess`, same reasoning as `useReservationMutation.ts`:
// a write that fails may still have landed. Invalidates `keys.clients()`
// only -- editing a guest's own name/phone changes nothing about any
// reservation's own data, `useDeactivateGuest.ts`'s identical scoping.

export type UpdateGuestInput = {
  readonly guestId: string
  readonly fullName: string
  readonly phone: string
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()

  return useMutation<Client, ApiError, UpdateGuestInput>({
    mutationFn: ({ guestId, fullName, phone }) =>
      apiRequest<Client>(`/clients/${guestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.clients() })
    },
  })
}
