import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import { queryClient } from '../../shared/mutation/queryClient'
import type { ApiError } from '../../shared/errors/ApiError'
import type { PlainDate } from '../../shared/date/parsePlainDate'
import { centavosToApiDecimalString } from '../../shared/money/toApiDecimalString'

// task 5.20-5.31, `reservation-recording` spec: `POST /reservations`
// (`back/app/schemas/reservation.py`'s `ReservationCreate`), exactly one of
// `price_per_night`/`price_total` (D6's own exclusivity check, mirrored
// client-side by `PriceStep.tsx`'s segmented control). D30's writes-never-
// retry rule is the shared `queryClient`'s own `mutations.retry: false`
// default (1.26/1.27) -- nothing here overrides it, deliberately: a
// retried create that actually succeeded the first time would produce a
// second stay.

export type CreateReservationInput = {
  readonly propertyId: string
  readonly clientId: string
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
  readonly pricePerNightCentavos: number | null
  readonly priceTotalCentavos: number | null
}

type CreateReservationResponse = { readonly id: string }

export function useCreateReservation() {
  return useMutation<CreateReservationResponse, ApiError, CreateReservationInput>({
    mutationFn: async (input: CreateReservationInput) => {
      return apiRequest<CreateReservationResponse>('/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: input.propertyId,
          client_id: input.clientId,
          check_in: input.checkIn,
          check_out: input.checkOut,
          price_per_night: input.pricePerNightCentavos !== null ? centavosToApiDecimalString(input.pricePerNightCentavos) : null,
          price_total: input.priceTotalCentavos !== null ? centavosToApiDecimalString(input.priceTotalCentavos) : null,
        }),
      })
    },
    // D30's invalidation table: "any reservation ... mutation invalidates
    // reservations, dashboard, and the affected reservation(id)" -- a
    // brand-new reservation has no prior `reservation(id)` cache entry to
    // invalidate, so only the two list-shaped keys apply here.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.reservations() })
      void queryClient.invalidateQueries({ queryKey: keys.dashboard() })
    },
  })
}
