import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { keys } from '../api/queries/keys'
import type { ApiError } from '../../shared/errors/ApiError'

// task 6.12 -- design D30's invalidation row, made structural:
//
//   "Any reservation or payment mutation invalidates `reservations`,
//    `dashboard`, and the affected `reservation(id)`. Written once as
//    `onSettled` in a shared mutation factory, not per call site."
//
// This is that factory. Every reservation/payment write in this app goes
// through it, so the three keys are invalidated in ONE place and a new
// mutation in Phases 7-8 gets the behaviour by using the factory rather
// than by remembering to copy three lines.
//
// **`onSettled`, not `onSuccess`, and the difference is real.** A write
// that fails may still have landed (a response lost on a phone in Mar del
// Tuyú is indistinguishable from a request that never arrived), and D30
// forbids retrying writes for exactly that reason. Refetching on the
// failure path too means the screen shows what the SERVER actually holds
// rather than what the client assumed, which is the only way she finds out
// that the payment she thinks failed was in fact recorded.
//
// **`useQueryClient()`, not the module-level singleton.** The singleton is
// what `routes.tsx`'s `RootLayout` provides in production, so both spellings
// agree there -- but only the hook is guaranteed to invalidate the client
// the surrounding tree is ACTUALLY reading from, which is what makes this
// behaviour observable in a test at all. Flagged, not fixed here:
// `useCreateReservation.ts` and `useFindOrCreateGuest.ts` (Phase 5) still
// invalidate the imported singleton directly. That is correct in
// production for the reason just given, and out of this slice's scope to
// change, but it means their invalidation is asserted by nothing.

/**
 * Wraps `useMutation` with D30's invalidation, keyed off the
 * `reservationId` every reservation-scoped write already carries in its
 * variables -- so the affected `reservation(id)` cannot be forgotten and
 * cannot be the wrong one.
 */
export function useReservationMutation<TData, TVariables extends { readonly reservationId: string }>(
  mutationFn: (variables: TVariables) => Promise<TData>,
): UseMutationResult<TData, ApiError, TVariables> {
  const queryClient = useQueryClient()

  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    onSettled: (_data, _error, variables) => {
      // `keys.reservations()` matches `reservationsByCabin(id)` by prefix,
      // and `keys.reservation(id)` matches `reservationPayments(id)` the
      // same way -- three invalidations reach five cache entries, which is
      // exactly why both keys were namespaced the way they were.
      void queryClient.invalidateQueries({ queryKey: keys.reservations() })
      void queryClient.invalidateQueries({ queryKey: keys.dashboard() })
      void queryClient.invalidateQueries({ queryKey: keys.reservation(variables.reservationId) })
    },
  })
}
