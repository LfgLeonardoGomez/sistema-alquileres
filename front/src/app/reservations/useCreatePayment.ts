import { apiRequest } from '../api/client'
import { centavosToApiDecimalString } from '../../shared/money/toApiDecimalString'
import { useReservationMutation } from './useReservationMutation'
import type { PaymentMethod } from './usePayments'

// task 6.8, `reservation-ledger` spec: "The 'Anotar un pago' sheet MUST
// submit a positive amount and the 'Devolución' sheet MUST submit a
// negative amount, both to `POST /reservations/{id}/payments`."
//
// ONE hook for both, because there is one endpoint and one row shape --
// the sign is decided by the sheet before it gets here, and this hook has
// no opinion about which of the two sent it. A second `useCreateRefund`
// would be a second place for the endpoint, the encoding and (later) the
// invalidation to drift.
//
// `paid_on` is deliberately NOT sent: `PaymentCreate` makes it optional
// and the server defaults it, and no task or spec scenario in this slice
// asks the owner to backdate a payment. Flagged rather than silently
// omitted -- the handoff's own list rows show a date per payment, so if
// backdating is ever wanted it is a field on the sheet, not a change here.

export type CreatePaymentInput = {
  readonly reservationId: string
  readonly amountCentavos: number
  readonly method: PaymentMethod
  readonly note: string | null
}

type CreatePaymentResponse = { readonly id: string }

export function useCreatePayment() {
  // Through D30's shared factory (6.12), so a recorded payment refreshes
  // the stay's own `Saldo`, its payments list, the calendar and the
  // dashboard's `Cobrado` without this module knowing any of those exist.
  return useReservationMutation<CreatePaymentResponse, CreatePaymentInput>((input) =>
    apiRequest<CreatePaymentResponse>(`/reservations/${input.reservationId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: centavosToApiDecimalString(input.amountCentavos),
        method: input.method,
        note: input.note,
      }),
    }),
  )
}
