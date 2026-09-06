import { apiRequest } from '../api/client'
import type { PlainDate } from '../../shared/date/parsePlainDate'
import { centavosToApiDecimalString } from '../../shared/money/toApiDecimalString'
import { useReservationMutation } from './useReservationMutation'

// tasks 6.21-6.29, design D34: `PATCH /reservations/{id}`
// (`back/app/schemas/reservation.py`'s `ReservationUpdate` -- `check_in`,
// `check_out`, `price_per_night`, `price_total`, and nothing else).
//
// Through 6.12's shared `useReservationMutation` factory, so a saved edit
// refreshes the stay's own detail, the cabin's calendar and the dashboard
// from one place (D30's invalidation row) rather than from three lines
// copied into this module.
//
// **No optimistic update, deliberately** (6.29). The new dates are never
// written into the cache before the server has accepted them: the server is
// the only party that knows whether the cabin is free, and an edit that is
// about to come back `409 dates_unavailable` would otherwise flash the new
// dates onto the calendar and then take them away again.

export type UpdateReservationInput = {
  readonly reservationId: string
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
  /**
   * BOTH price fields, always, exactly one of them `null` -- D34's own
   * rule, and the reason this pair is modelled as two required properties
   * rather than as an optional "price" union. Making either one optional
   * here would put the trap below one forgotten field away again.
   */
  readonly pricePerNightCentavos: number | null
  readonly priceTotalCentavos: number | null
}

type UpdateReservationResponse = { readonly id: string }

export function useUpdateReservation() {
  return useReservationMutation<UpdateReservationResponse, UpdateReservationInput>((input) =>
    apiRequest<UpdateReservationResponse>(`/reservations/${input.reservationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // **Both price keys are always written, one of them explicitly
      // `null`** (D34, task 6.23). This is the trap: the handler applies
      // `model_dump(exclude_unset=True)`, so an OMITTED key leaves the old
      // column untouched -- send only `{"price_per_night": 45000}` on a
      // stay-total reservation and BOTH columns end up populated, which
      // trips the table's `CHECK (num_nonnulls(price_per_night,
      // price_total) = 1)` and returns `23514 -> 422`. The owner would then
      // read "Revisá los datos" for a change she made perfectly.
      //
      // Written as an unconditional object literal rather than a spread of
      // conditional fragments precisely so a key cannot go missing: there
      // is no branch here in which either name is absent.
      body: JSON.stringify({
        check_in: input.checkIn,
        check_out: input.checkOut,
        price_per_night:
          input.pricePerNightCentavos === null ? null : centavosToApiDecimalString(input.pricePerNightCentavos),
        price_total: input.priceTotalCentavos === null ? null : centavosToApiDecimalString(input.priceTotalCentavos),
      }),
    }),
  )
}
