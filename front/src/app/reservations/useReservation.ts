import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import { parsePlainDate, type PlainDate } from '../../shared/date/parsePlainDate'
import { parseMoney } from '../../shared/money/parseMoney'

// task 6.2, handoff screen 06: `GET /reservations/{id}` -- the single
// reservation behind the detail screen, keyed on D30's own
// `keys.reservation(id)`, which is also the key every reservation and
// payment mutation invalidates (6.12).
//
// Decode boundary (D27/D35), the same shape `useReservationsForCabin.ts`
// established: dates are branded to `PlainDate` and every `Decimal`-as-
// string (`"180000.00"`) is parsed to integer centavos exactly once, here,
// so no component downstream ever re-parses a money string or reasons
// about a raw `Date`.
export type ReservationDetail = {
  readonly id: string
  readonly propertyId: string
  readonly clientId: string
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
  readonly status: string
  readonly pricePerNightCentavos: number | null
  readonly priceTotalCentavos: number | null
  readonly paidAmountCentavos: number
  readonly effectiveTotalCentavos: number
  readonly balanceCentavos: number
}

export type ApiReservation = {
  readonly id: string
  readonly property_id: string
  readonly client_id: string
  readonly check_in: string
  readonly check_out: string
  readonly status: string
  readonly price_per_night: string | null
  readonly price_total: string | null
  readonly paid_amount: string
  readonly effective_total: string
  readonly balance: string
}

// Exported (task 7.7/7.8) so `useReservations.ts` -- the guest directory's
// own all-reservations list, D30's "reservation list" the `guest-directory`
// spec computes per-guest aggregates from -- decodes through this exact
// function rather than a third hand-written copy of the same
// `Decimal`-as-string/date-branding boundary `useReservationsForCabin.ts`
// already has one of.
export function decodeReservationDetail(raw: ApiReservation): ReservationDetail {
  return {
    id: raw.id,
    propertyId: raw.property_id,
    clientId: raw.client_id,
    checkIn: parsePlainDate(raw.check_in),
    checkOut: parsePlainDate(raw.check_out),
    status: raw.status,
    pricePerNightCentavos: raw.price_per_night === null ? null : parseMoney(raw.price_per_night),
    priceTotalCentavos: raw.price_total === null ? null : parseMoney(raw.price_total),
    paidAmountCentavos: parseMoney(raw.paid_amount),
    effectiveTotalCentavos: parseMoney(raw.effective_total),
    balanceCentavos: parseMoney(raw.balance),
  }
}

export function useReservation(reservationId: string | null) {
  return useQuery({
    queryKey: keys.reservation(reservationId ?? ''),
    queryFn: async () => decodeReservationDetail(await apiRequest<ApiReservation>(`/reservations/${reservationId}`)),
    enabled: reservationId !== null,
  })
}
