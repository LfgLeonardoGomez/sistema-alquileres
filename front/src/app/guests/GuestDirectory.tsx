import { useState } from 'react'
import { GUEST_DIRECTORY_COPY, guestOwesLabel, guestStayCountLabel } from '../../shared/copy/guests'
import { SHELL_COPY } from '../../shared/copy/shell'
import { formatMoney } from '../../shared/money/formatMoney'
import { TabBar } from '../shell/TabBar'
import { useCabins } from '../reservations/useCabins'
import { useClients } from '../reservations/useClients'
import { useReservations } from '../reservations/useReservations'
import { AddGuestSheet } from './AddGuestSheet'
import { GuestSheet } from './GuestSheet'
import { summarizeGuestStays } from './guestSummary'

// task 7.1/7.2, handoff screen 09 ("Huéspedes"). `useClients()` (4.9) is
// the app's ONE lookup call site for `/clients` and already fetches
// `include_inactive=true` (D30) -- this screen's own job is presentation
// only: a deactivated guest renders grey and marked "Desactivado" rather
// than being filtered out, which is the `guest-directory` spec's central
// requirement (D30's own carve-out from the "cancelled/inactive rows are
// filtered out of every list" rule everywhere else in this app).
//
// `data-tone="muted"` on the inactive row is the same styling-hook
// convention `ReservationDetail.test.tsx`'s `data-tone="error"` already
// established -- this codebase renders unstyled semantic markup, so a data
// attribute is the test-observable stand-in for the handoff's grey text
// until a stylesheet exists to read it.

export function GuestDirectory() {
  const clients = useClients()
  const reservations = useReservations()
  const cabins = useCabins()
  const allGuests = clients.data ?? []
  const [isAddOpen, setIsAddOpen] = useState(false)
  // Phase 7b (owner-waived TDD, 2026-09-06): an id, not the `Client` object
  // itself -- so an edit (which invalidates `keys.clients()`) is reflected
  // in the open sheet on the very next `useClients()` refetch, rather than
  // the sheet going on showing whatever was captured at click time. Before
  // this change `GuestSheet` would have kept rendering the pre-edit name
  // and phone until closed and reopened -- exactly the class of bug this
  // change's own owner decision (`decisions/guest-edit-untested`) named as
  // unreachable by a click-test, found here while wiring the edit sheet in.
  const [openGuestId, setOpenGuestId] = useState<string | null>(null)
  const openGuest = openGuestId === null ? null : (allGuests.find((guest) => guest.id === openGuestId) ?? null)
  const [search, setSearch] = useState('')

  // task 7.5/7.6: a client-side substring filter over the already-fetched
  // list (D30 -- there is no server-side search endpoint to call instead).
  // Matches name OR phone, case-insensitively for the name half (a phone
  // number has no case to normalise).
  const query = search.trim().toLowerCase()
  const guests =
    query === ''
      ? allGuests
      : allGuests.filter((guest) => guest.full_name.toLowerCase().includes(query) || guest.phone.includes(query))

  return (
    <div>
      <h1>{GUEST_DIRECTORY_COPY.title}</h1>

      <label>
        {GUEST_DIRECTORY_COPY.searchLabel}
        <input value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      {allGuests.length === 0 ? (
        <p>{SHELL_COPY.guestsEmpty}</p>
      ) : (
        <ul>
          {guests.map((guest) => {
            const summary = summarizeGuestStays(reservations.data ?? [], guest.id)
            return (
              <li key={guest.id} data-tone={guest.is_active ? undefined : 'muted'}>
                <button type="button" onClick={() => setOpenGuestId(guest.id)}>
                  <span>{guest.full_name}</span>
                  <span>{guest.phone}</span>
                  <span>{guestStayCountLabel(summary.stayCount)}</span>
                  {summary.balanceCentavos > 0 ? <span>{guestOwesLabel(formatMoney(summary.balanceCentavos))}</span> : null}
                  {!guest.is_active ? <span>{GUEST_DIRECTORY_COPY.inactiveTag}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={() => setIsAddOpen(true)}>
        {GUEST_DIRECTORY_COPY.addGuest}
      </button>

      {isAddOpen ? <AddGuestSheet onClose={() => setIsAddOpen(false)} /> : null}

      {openGuest !== null ? (
        <GuestSheet
          guest={openGuest}
          reservations={reservations.data ?? []}
          cabins={cabins.data ?? []}
          onClose={() => setOpenGuestId(null)}
        />
      ) : null}

      <TabBar />
    </div>
  )
}
