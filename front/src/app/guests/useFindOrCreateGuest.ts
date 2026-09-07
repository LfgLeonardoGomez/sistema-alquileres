import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequestWithStatus } from '../api/client'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'
import type { Client } from '../reservations/useClients'

// task 5.16/5.17, D33: "POST /clients is find-or-create-or-reactivate...
// It returns 201 when it created a guest and 200 when it matched an
// existing phone -- and it deliberately does NOT overwrite the stored
// name." The same sheet is meant to be reused by slice 7 (D33's own
// closing line); this hook is the reusable half -- the API call and the
// 200-vs-201 decode -- so `GuestStep.tsx` (this slice) and the guest
// directory's own add-guest sheet (task 7.3/7.4) share one call site
// rather than two independent implementations of the same branch.
//
// **Closed at task 7.3, the OPEN TECHNICAL ITEM 6.12's own comment
// flagged**: this hook used to invalidate the imported `queryClient`
// singleton directly. Correct in production (`routes.tsx`'s `RootLayout`
// provides that same singleton) but, per `useReservationMutation.ts`'s own
// recorded reasoning, "only the hook is guaranteed to invalidate the
// client the surrounding tree is ACTUALLY reading from" -- which is what
// makes the reactivation half of `GuestDirectory.test.tsx`'s add-guest
// test observable at all. Without this, `GuestDirectory`'s freshly built
// `QueryClient` never learns the deactivated guest was reactivated, and the
// row keeps reading "Desactivado" after a successful `POST /clients`.

export type FindOrCreateGuestInput = {
  readonly fullName: string
  readonly phone: string
}

export type FindOrCreateGuestResult = {
  readonly client: Client
  /** `true` on a real 201 (a brand-new record); `false` on a 200 match,
   * whether that matched an already-active guest or reactivated a
   * deactivated one (D8: the server clears `deleted_at` either way, and
   * both paths report the same status code -- the client has no way to
   * tell reactivation apart from "already active" from the status alone,
   * and does not need to: task 5.19's own "confirmed by 5.17" reasoning). */
  readonly wasCreated: boolean
}

type ClientApiResponse = {
  readonly id: string
  readonly full_name: string
  readonly phone: string
  readonly email: string | null
  readonly national_id: string | null
  readonly is_active: boolean
}

export function useFindOrCreateGuest() {
  const queryClient = useQueryClient()

  return useMutation<FindOrCreateGuestResult, ApiError, FindOrCreateGuestInput>({
    mutationFn: async ({ fullName, phone }: FindOrCreateGuestInput): Promise<FindOrCreateGuestResult> => {
      const { data, status } = await apiRequestWithStatus<ClientApiResponse>('/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone }),
      })
      return { client: data, wasCreated: status === 201 }
    },
    // A resolved/created/reactivated guest may not be in `useClients()`'s
    // cached list yet (a brand-new record) or may have just had
    // `deleted_at` cleared (a reactivation) -- invalidating `keys.clients()`
    // (D30's own invalidation table doesn't name this call site
    // explicitly, but its stated reasoning -- "a second copy is a second
    // truth" -- applies identically here) keeps every other screen's guest
    // list from disagreeing with what this sheet just did.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.clients() })
    },
  })
}
