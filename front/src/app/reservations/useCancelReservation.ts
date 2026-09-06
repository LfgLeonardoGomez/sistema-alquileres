import { apiRequest } from '../api/client'
import { useReservationMutation } from './useReservationMutation'

// task 6.10, `reservation-ledger` spec: "Confirming MUST call `POST
// /reservations/{id}/cancel`". Nothing is deleted -- the row keeps its
// payments and its history and only its `status` moves (the same
// deactivate-never-delete rule the whole product is built on).
//
// D30's writes-never-retry rule is the shared `queryClient`'s own
// `mutations.retry: false` default; nothing here overrides it. The
// invalidation that frees the nights on a live calendar (6.11/6.12) is
// `useReservationMutation`'s, not this module's -- written once, there.

export type CancelReservationInput = {
  readonly reservationId: string
}

type CancelReservationResponse = { readonly id: string; readonly status: string }

export function useCancelReservation() {
  return useReservationMutation<CancelReservationResponse, CancelReservationInput>(({ reservationId }) =>
    apiRequest<CancelReservationResponse>(`/reservations/${reservationId}/cancel`, { method: 'POST' }),
  )
}
