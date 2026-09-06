import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import { parsePlainDate, type PlainDate } from '../../shared/date/parsePlainDate'
import { parseMoney } from '../../shared/money/parseMoney'

// task 6.6, `reservation-ledger` spec: "The 'Pagos' list MUST include both
// payments and refunds together ... matching the API's sign-only
// discrimination (there is no separate `kind` field)."
//
// That absence is the whole type: `amountCentavos` is a signed integer and
// nothing else distinguishes a refund from a payment -- there is no `kind`
// field to add here, and adding a derived `isRefund` boolean would invent
// a second way to ask the same question.
export type PaymentMethod = 'cash' | 'transfer' | 'other'

export type Payment = {
  readonly id: string
  readonly amountCentavos: number
  readonly method: PaymentMethod
  readonly paidOn: PlainDate
  readonly note: string | null
}

type ApiPayment = {
  readonly id: string
  readonly amount: string
  readonly method: PaymentMethod
  readonly paid_on: string
  readonly note: string | null
}

function decodePayment(raw: ApiPayment): Payment {
  return {
    id: raw.id,
    amountCentavos: parseMoney(raw.amount),
    method: raw.method,
    paidOn: parsePlainDate(raw.paid_on),
    note: raw.note,
  }
}

export function usePayments(reservationId: string | null) {
  return useQuery({
    queryKey: keys.reservationPayments(reservationId ?? ''),
    queryFn: async () => (await apiRequest<ApiPayment[]>(`/reservations/${reservationId}/payments`)).map(decodePayment),
    enabled: reservationId !== null,
  })
}
