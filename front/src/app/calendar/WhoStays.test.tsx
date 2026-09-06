import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { CALENDAR_COPY } from '../../shared/copy/calendar'
import { parsePlainDate } from '../../shared/date/parsePlainDate'
import type { ReservationForCalendar } from '../reservations/useReservationsForCabin'
import { WhoStays } from './WhoStays'

// tasks 4.19-4.28: `reservation-calendar` spec's "'Quién Se Queda' Lists
// Every Non-Cancelled Stay Overlapping The Month, Ordered By Check-In",
// "Guest And Cabin Names Are Resolved From A Lookup That Includes Inactive
// Records", "An Empty Month Shows An Instructive State", and "Each List Row
// Shows Debe Or Pagado". `ReservationForCalendar` is the already-decoded
// shape `useReservationsForCabin.ts` produces (D27's decode boundary) --
// `balanceCentavos` is already-parsed integer centavos, not a raw API
// string, matching every other test fixture in this run.

const MONTH = { year: 2026, month: 9 }

type ReservationOverrides = {
  readonly id?: string
  readonly clientId?: string
  readonly checkIn?: string
  readonly checkOut?: string
  readonly status?: string
  readonly balanceCentavos?: number
}

function reservation(overrides: ReservationOverrides): ReservationForCalendar {
  return {
    id: overrides.id ?? 'r-default',
    clientId: overrides.clientId ?? 'c-default',
    checkIn: parsePlainDate(overrides.checkIn ?? '2026-09-03'),
    checkOut: parsePlainDate(overrides.checkOut ?? '2026-09-07'),
    status: overrides.status ?? 'confirmed',
    balanceCentavos: overrides.balanceCentavos ?? 0,
  }
}

function renderWhoStays(reservations: readonly ReservationForCalendar[], guestsById: ReadonlyMap<string, { full_name: string }>) {
  return render(
    <MemoryRouter>
      <WhoStays reservations={reservations} guestsById={guestsById} month={MONTH} slotByKey={new Map()} />
    </MemoryRouter>,
  )
}

describe('WhoStays', () => {
  // 4.19/4.20: ordered by check_in, not by array/creation order -- the API
  // orders by `created_at`, so the 5th-of-the-month stay is placed FIRST in
  // the input array (as if created first) to prove the component re-sorts
  // rather than trusting input order.
  it('lists every non-cancelled reservation overlapping the month, ordered by check_in regardless of input order', () => {
    const createdFifthFirst = [
      reservation({ id: 'r-5th', clientId: 'c-a', checkIn: '2026-09-05', checkOut: '2026-09-08' }),
      reservation({ id: 'r-2nd', clientId: 'c-b', checkIn: '2026-09-02', checkOut: '2026-09-04' }),
    ]
    const guestsById = new Map([
      ['c-a', { full_name: 'Guest A' }],
      ['c-b', { full_name: 'Guest B' }],
    ])

    renderWhoStays(createdFifthFirst, guestsById)

    const rows = screen.getAllByTestId(/^stay-/)
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual(['stay-r-2nd', 'stay-r-5th'])
  })

  // [TRIANGULATE] a reservation with no overlap at all with the displayed
  // month must not appear -- proving the "overlapping the month" half of
  // the filter fires, not merely the cancelled half.
  it('[TRIANGULATE] excludes a reservation that does not overlap the displayed month at all', () => {
    const reservations = [
      reservation({ id: 'r-in-month', checkIn: '2026-09-03', checkOut: '2026-09-05' }),
      reservation({ id: 'r-other-month', checkIn: '2026-11-01', checkOut: '2026-11-03' }),
    ]
    renderWhoStays(reservations, new Map([['c-default', { full_name: 'Guest' }]]))

    expect(screen.getByTestId('stay-r-in-month')).toBeInTheDocument()
    expect(screen.queryByTestId('stay-r-other-month')).not.toBeInTheDocument()
  })

  // 4.21/4.22: a cancelled reservation overlapping the month does not
  // appear at all, even though it overlaps.
  it('[TRIANGULATE] does not render a cancelled reservation overlapping the month', () => {
    const reservations = [
      reservation({ id: 'r-active', status: 'confirmed' }),
      reservation({ id: 'r-cancelled', status: 'cancelled' }),
    ]
    renderWhoStays(reservations, new Map([['c-default', { full_name: 'Guest' }]]))

    expect(screen.getByTestId('stay-r-active')).toBeInTheDocument()
    expect(screen.queryByTestId('stay-r-cancelled')).not.toBeInTheDocument()
  })

  // 4.23/4.24: a deactivated guest's stay still shows their full name --
  // `is_active` never gates the lookup, confirmed by 4.9's
  // `include_inactive=true` fetch (the lookup this component is handed
  // already includes the deactivated guest).
  it('shows a deactivated guest’s full name, not a blank', () => {
    const reservations = [reservation({ id: 'r-1', clientId: 'c-inactive' })]
    const guestsById = new Map([['c-inactive', { full_name: 'Huésped Desactivado' }]])

    renderWhoStays(reservations, guestsById)

    expect(screen.getByText('Huésped Desactivado')).toBeInTheDocument()
  })

  // 4.25/4.26: the exact empty-state copy, with the reachable primary
  // action, when zero non-cancelled reservations overlap the month.
  it('shows the exact empty-state copy and a reachable primary action when nothing overlaps the month', () => {
    renderWhoStays([], new Map())

    expect(screen.getByText('Todavía no anotaste ninguna reserva en este mes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: CALENDAR_COPY.addReservation })).toHaveAttribute('href', '/reserva/nueva/1')
  })

  // [TRIANGULATE] the empty state also fires when every overlapping
  // reservation is cancelled -- not merely when the input array is empty.
  it('[TRIANGULATE] shows the empty state when every overlapping reservation is cancelled', () => {
    renderWhoStays([reservation({ id: 'r-cancelled', status: 'cancelled' })], new Map([['c-default', { full_name: 'Guest' }]]))

    expect(screen.getByText('Todavía no anotaste ninguna reserva en este mes')).toBeInTheDocument()
  })

  // 4.27/4.28: Debe vs Pagado, wired to `displayBalance()`.
  it('shows "Debe $ 80.000" for a row with a positive displayBalance()', () => {
    renderWhoStays(
      [reservation({ id: 'r-owing', clientId: 'c-a', balanceCentavos: 8_000_000 })],
      new Map([['c-a', { full_name: 'Guest A' }]]),
    )

    expect(screen.getByText('Debe $ 80.000')).toBeInTheDocument()
  })

  it('shows "Pagado" for a row with a zero balance', () => {
    renderWhoStays(
      [reservation({ id: 'r-paid', clientId: 'c-a', balanceCentavos: 0 })],
      new Map([['c-a', { full_name: 'Guest A' }]]),
    )

    expect(screen.getByText('Pagado')).toBeInTheDocument()
  })
})
