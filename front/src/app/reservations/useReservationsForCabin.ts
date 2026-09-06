import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { keys } from '../api/queries/keys'
import { parsePlainDate, type PlainDate } from '../../shared/date/parsePlainDate'
import { parseMoney } from '../../shared/money/parseMoney'

// task 4.14's incidental plumbing: the reservation calendar screen needs
// the property's COMPLETE `check_in`-ordered stay list for one cabin (D28's
// pastel-assignment tripwire against a visible-month-filtered slice), never
// date-windowed -- `GET /reservations?property_id=` returns the whole list
// server-side (no pagination, D28's own note), so this hook asks for
// exactly that and nothing more.
//
// Decode boundary (D27/D35): the raw API shape carries `check_in`/
// `check_out` as plain date strings and `balance` as a `Decimal`-as-string
// (`"80000.00"`) -- both are branded/parsed HERE, once, so every consumer
// downstream (`WhoStays`, `PrivateMonthCalendar` via `pastels.ts`) works
// with a `PlainDate` and an already-parsed integer-centavos number, never a
// raw string it would have to re-parse itself.
export type ReservationForCalendar = {
  readonly id: string
  readonly clientId: string
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
  readonly status: string
  readonly balanceCentavos: number
}

type ApiReservation = {
  readonly id: string
  readonly client_id: string
  readonly check_in: string
  readonly check_out: string
  readonly status: string
  readonly balance: string
}

function decodeReservation(raw: ApiReservation): ReservationForCalendar {
  return {
    id: raw.id,
    clientId: raw.client_id,
    checkIn: parsePlainDate(raw.check_in),
    checkOut: parsePlainDate(raw.check_out),
    status: raw.status,
    balanceCentavos: parseMoney(raw.balance),
  }
}

export function useReservationsForCabin(cabinId: string | null) {
  return useQuery({
    queryKey: keys.reservationsByCabin(cabinId ?? ''),
    queryFn: async () => {
      const raw = await apiRequest<ApiReservation[]>(`/reservations?property_id=${cabinId}`)
      return raw.map(decodeReservation)
    },
    enabled: cabinId !== null,
  })
}
