import { Link } from 'react-router'
import { monthWindow, type YearMonth } from '../../shared/calendar/monthGrid'
import { CALENDAR_COPY } from '../../shared/copy/calendar'
import { nightsBetween } from '../../shared/date/nightsBetween'
import { formatDateRange } from '../../shared/date/format'
import { formatMoney } from '../../shared/money/formatMoney'
import { rowClass } from '../../shared/ui'
import { displayBalance } from '../reservations/displayBalance'
import type { ReservationForCalendar } from '../reservations/useReservationsForCabin'
import { PASTEL_DOT_CLASS, type PastelSlot } from './pastels'

// `reservation-calendar` spec: "'Quién Se Queda' Lists Every Non-Cancelled
// Stay Overlapping The Month, Ordered By Check-In" -- the API orders by
// `created_at` (D30), so this component owns the re-sort, never trusting
// input order. Guest names are resolved from `guestsById`, a lookup the
// caller built from `useClients()`'s `include_inactive=true` request (4.9) --
// this component has no opinion on `is_active` at all, structurally: the
// lookup type below carries only `full_name`, nothing to gate on.
type GuestLookup = ReadonlyMap<string, { readonly full_name: string }>

type Props = {
  readonly reservations: readonly ReservationForCalendar[]
  readonly guestsById: GuestLookup
  readonly month: YearMonth
  readonly slotByKey: ReadonlyMap<string, PastelSlot>
}

function overlapsMonth(reservation: ReservationForCalendar, month: YearMonth): boolean {
  const { start, end } = monthWindow(month)
  // Half-open interval comparison, string-lexicographic on the branded
  // `YYYY-MM-DD` shape (the same convention `pastels.ts`'s own adjacency
  // check uses) -- two ranges overlap iff each starts before the other ends.
  return reservation.checkIn < end && reservation.checkOut > start
}

export function WhoStays({ reservations, guestsById, month, slotByKey }: Props) {
  const staying = reservations
    .filter((reservation) => reservation.status !== 'cancelled')
    .filter((reservation) => overlapsMonth(reservation, month))
    .slice()
    .sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0))

  if (staying.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <p className="text-lg text-muted">{CALENDAR_COPY.emptyMonth}</p>
        <Link
          to="/reserva/nueva/1"
          className="flex h-16 items-center justify-center rounded-btn bg-accent text-lg font-extrabold text-white"
        >
          {CALENDAR_COPY.addReservation}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-[17px] font-extrabold text-muted">{CALENDAR_COPY.whoStaysTitle}</h2>
      <ul className="flex flex-col gap-2.5">
        {staying.map((reservation) => {
          const guest = guestsById.get(reservation.clientId)
          const nights = nightsBetween(reservation.checkIn, reservation.checkOut)
          const nightsLabel = nights === 1 ? CALENDAR_COPY.night : CALENDAR_COPY.nights
          // D27: the reservation-calendar list's own scope is Debe/Pagado
          // only -- a negative balance (a refund owed) is the detail
          // screen's own "Le tenés que devolver" presentation
          // (`reservation-ledger`, out of this screen's scope) and renders
          // here as "Pagado" rather than inventing an untested third state.
          const balanceCentavos = displayBalance({ status: reservation.status, balance: reservation.balanceCentavos })
          const slot = slotByKey.get(reservation.id) ?? 0
          return (
            <li key={reservation.id} data-testid={`stay-${reservation.id}`} data-pastel-slot={slotByKey.get(reservation.id)}>
              <Link to={`/reserva/${reservation.id}`} className={rowClass}>
                <span className={`h-3 w-3 shrink-0 rounded-pill ${PASTEL_DOT_CLASS[slot as PastelSlot]}`} />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-lg font-bold text-primary">{guest?.full_name ?? ''}</span>
                  <span className="text-base text-muted-2">
                    {formatDateRange(reservation.checkIn, reservation.checkOut)} · {nights} {nightsLabel}
                  </span>
                </div>
                <span className={`text-base font-extrabold ${balanceCentavos > 0 ? 'text-warm' : 'text-green-ink'}`}>
                  {balanceCentavos > 0 ? `${CALENDAR_COPY.debePrefix} ${formatMoney(balanceCentavos)}` : CALENDAR_COPY.paid}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
