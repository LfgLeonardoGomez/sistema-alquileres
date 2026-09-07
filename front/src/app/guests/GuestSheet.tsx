import { useState } from 'react'
import { Link } from 'react-router'
import { GUEST_SHEET_COPY, stayOverflowLine } from '../../shared/copy/guests'
import { formatDateRange, monthNameFor } from '../../shared/date/format'
import { nightsBetween } from '../../shared/date/nightsBetween'
import { formatMoney } from '../../shared/money/formatMoney'
import type { Cabin } from '../reservations/useCabins'
import type { Client } from '../reservations/useClients'
import type { ReservationDetail } from '../reservations/useReservations'
import { DeactivateGuestSheet } from './DeactivateGuestSheet'
import { GuestEditSheet } from './GuestEditSheet'
import { summarizeGuestStays } from './guestSummary'

// tasks 7.9-7.14, handoff screen 10 ("Un huésped, al tocarlo"). Receives
// the directory's ALREADY-FETCHED guest and reservation lists as props --
// `GuestDirectory` (7.7/7.8) already holds both via `useClients()`/
// `useReservations()`, so this sheet fetches nothing of its own beyond the
// deactivate mutation (7.14) that only it needs.
//
// `VISIBLE_STAY_COUNT` is this run's own invented number, flagged rather
// than lifted from the handoff: screen 10 draws a handful of stay rows and
// states only that "the sheet must fit within the viewport without
// scrolling on a 874px phone", never a literal count. 3 is a reasonable
// guess for that constraint, not a measured one.
const VISIBLE_STAY_COUNT = 3

type Props = {
  readonly guest: Client
  readonly reservations: readonly ReservationDetail[]
  readonly cabins: readonly Cabin[]
  readonly onClose: () => void
}

export function GuestSheet({ guest, reservations, cabins, onClose }: Props) {
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const summary = summarizeGuestStays(reservations, guest.id)
  const visibleStays = summary.stays.slice(0, VISIBLE_STAY_COUNT)
  const overflowStays = summary.stays.slice(VISIBLE_STAY_COUNT)

  function cabinName(propertyId: string): string {
    return cabins.find((cabin) => cabin.id === propertyId)?.name ?? ''
  }

  return (
    <div role="dialog" aria-label={guest.full_name}>
      <h2>{guest.full_name}</h2>
      <p>{guest.phone}</p>
      {/* Phase 7b (owner-waived TDD, 2026-09-06): the "Editar" affordance
          Phase 7 flagged but deliberately did not build (no task in
          7.1-7.16 tested it). Opens `GuestEditSheet`, wired to `GuestForm`
          reused in edit mode. */}
      <button type="button" onClick={() => setIsEditOpen(true)}>
        {GUEST_SHEET_COPY.edit}
      </button>

      <section aria-label={GUEST_SHEET_COPY.saldoLabel}>
        <span>{GUEST_SHEET_COPY.saldoLabel}</span>
        <span>{formatMoney(summary.balanceCentavos)}</span>
      </section>

      <section aria-label={GUEST_SHEET_COPY.staysTitle}>
        <h3>{GUEST_SHEET_COPY.staysTitle}</h3>
        <ul>
          {visibleStays.map((stay) => {
            const nights = nightsBetween(stay.checkIn, stay.checkOut)
            return (
              <li key={stay.id}>
                <Link to={`/reserva/${stay.id}`}>
                  {cabinName(stay.propertyId)} · {formatDateRange(stay.checkIn, stay.checkOut)}
                </Link>
                <span>
                  {nights} · {formatMoney(stay.effectiveTotalCentavos)}
                </span>
              </li>
            )
          })}
        </ul>
        {overflowStays.length > 0 ? <p>{stayOverflowLine(overflowStays.length, monthNameFor(overflowStays[0]!.checkIn))}</p> : null}
      </section>

      {/* Not wired to a preselected guest -- the wizard (Phase 5) has no
          prop for one -- but a real, existing route rather than a dead
          link, on 3.23's "never a dead link" convention. Flagged, not
          tested: no task in this phase exercises this affordance. */}
      <Link to="/reserva/nueva/1">{GUEST_SHEET_COPY.addReservation}</Link>
      <button type="button" onClick={() => setIsDeactivateOpen(true)}>
        {GUEST_SHEET_COPY.deactivate}
      </button>
      <button type="button" onClick={onClose}>
        {GUEST_SHEET_COPY.close}
      </button>

      {isDeactivateOpen ? (
        <DeactivateGuestSheet
          guestId={guest.id}
          onClose={() => setIsDeactivateOpen(false)}
          onDeactivated={() => setIsDeactivateOpen(false)}
        />
      ) : null}

      {isEditOpen ? (
        <GuestEditSheet guest={guest} onClose={() => setIsEditOpen(false)} onSaved={() => setIsEditOpen(false)} />
      ) : null}
    </div>
  )
}
