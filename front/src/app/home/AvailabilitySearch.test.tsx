import { configure, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'
import { availabilityBookAction, HOME_COPY } from '../../shared/copy/home'
import { GUESTS_COPY } from '../../shared/copy/guests'
import { RESERVATION_WIZARD_COPY } from '../../shared/copy/reservations'

// Owner's own words (2026-09-07, `decisions/book-from-availability-result`):
// "para no tener que verificar, ver disponibilidad, confirmamos y después
// empezamos de nuevo presionando anotar una reserva y volver a cargar las
// fechas, casa, etc." -- a "Libre" row must start the reservation with that
// cabin and those dates already on the draft, landing on the wizard's guest
// step (3), the first thing genuinely still unknown.
//
// Rendered through the REAL `routeConfig` (`Wizard.test.tsx`'s own
// established pattern, not a stand-in route): the whole point of these
// tests is proving the deep entry survives `Wizard.tsx`'s own step-3 guard
// (`draft.cabin === null || draft.dates === null` -> redirect to step 1),
// which a stand-in route could never exercise. `configure({ asyncUtilTimeout:
// 5000 })` is that same file's own fix for the real cost of mounting two
// `lazy()` chunks (`/inicio`'s `HomeScreen`, `/reserva/nueva/:paso`'s
// `Wizard`) under a full parallel suite run -- a timing budget, not a
// behaviour, scoped to this file for the same reason.
configure({ asyncUtilTimeout: 5000 })

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'
const DOS_AGUAS = 'b2222222-2222-2222-2222-222222222222'

function cabinsHandler() {
  return http.get('http://localhost:8000/properties', () =>
    HttpResponse.json([
      { id: CASA_AZUL, name: 'Casa Azul', is_active: true },
      { id: DOS_AGUAS, name: 'Casa Dos Aguas', is_active: true },
    ]),
  )
}

function clientsHandler() {
  return http.get('http://localhost:8000/clients', () => HttpResponse.json([]))
}

type ReservationFixture = Record<string, unknown>

function reservationsHandler(reservations: readonly ReservationFixture[]) {
  return http.get('http://localhost:8000/reservations', () => HttpResponse.json(reservations))
}

function stayFixture(propertyId: string, checkIn: string, checkOut: string): ReservationFixture {
  return {
    id: `res-${propertyId}-${checkIn}`,
    property_id: propertyId,
    client_id: 'cli-1111-1111-1111-111111111111',
    check_in: checkIn,
    check_out: checkOut,
    status: 'confirmed',
    price_per_night: null,
    price_total: '10000.00',
    paid_amount: '0.00',
    effective_total: '10000.00',
    balance: '10000.00',
  }
}

// `renderWizardAt`'s own pattern (`Wizard.test.tsx`), started at `/inicio`
// instead: a session is required to reach ANY authenticated screen
// (`RequireSession`), matching that file's established fix for the same
// guard.
async function renderHomeAt(path: string) {
  const { useSessionStore } = await import('../session/store')
  useSessionStore.getState().setToken('a-valid-looking-token')
  const { routeConfig } = await import('../../routes')
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

async function searchDates(checkIn: string, checkOut: string) {
  fireEvent.change(await screen.findByLabelText(HOME_COPY.availabilityEntradaLabel), { target: { value: checkIn } })
  fireEvent.change(screen.getByLabelText(HOME_COPY.availabilitySalidaLabel), { target: { value: checkOut } })
}

describe('AvailabilitySearch', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(async () => {
    Object.assign(import.meta.env, originalEnv)
    const { useSessionStore } = await import('../session/store')
    useSessionStore.getState().clearToken()
    const { useWizardDraftStore } = await import('../reservations/wizard/store')
    useWizardDraftStore.getState().reset()
  })

  // Test 1: activating a "Libre" row lands on the wizard's guest step with
  // that cabin and those dates already in the draft.
  it('lands on the wizard guest step with the searched cabin and dates already in the draft when a "Libre" row is activated', async () => {
    server.use(
      cabinsHandler(),
      clientsHandler(),
      reservationsHandler([stayFixture(DOS_AGUAS, '2026-09-22', '2026-09-23')]),
    )

    const user = userEvent.setup()
    await renderHomeAt('/inicio')
    await searchDates('2026-09-20', '2026-09-25')

    const bookLink = await screen.findByRole('link', {
      name: availabilityBookAction('Casa Azul', '20 al 25 de septiembre'),
    })
    await user.click(bookLink)

    await screen.findByRole('heading', { name: GUESTS_COPY.guestStepTitle })

    const { useWizardDraftStore } = await import('../reservations/wizard/store')
    const draft = useWizardDraftStore.getState()
    expect(draft.cabin).toEqual({ id: CASA_AZUL, name: 'Casa Azul' })
    expect(draft.dates).toEqual({ checkIn: '2026-09-20', checkOut: '2026-09-25' })
  })

  // Test 2: an "Ocupada" row is NOT actionable -- proved, not assumed.
  //
  // Scoped to the availability card's own "Ocupada" row (`within(...)`):
  // `UpcomingArrivals`, the sibling card on the SAME screen, also renders
  // "Casa Dos Aguas" as its own next-arrival row, from the very same
  // reservation fixture -- an unscoped `getByText` is genuinely ambiguous
  // here, not merely a query style choice.
  it('never makes an "Ocupada" row actionable', async () => {
    server.use(
      cabinsHandler(),
      clientsHandler(),
      reservationsHandler([stayFixture(DOS_AGUAS, '2026-09-22', '2026-09-23')]),
    )

    await renderHomeAt('/inicio')
    await searchDates('2026-09-20', '2026-09-25')

    const occupiedStatus = await screen.findByText(HOME_COPY.availabilityOccupied)
    const occupiedRow = occupiedStatus.closest('li')
    expect(occupiedRow).not.toBeNull()
    if (occupiedRow === null) throw new Error('unreachable: asserted above')

    const cabinNameNode = within(occupiedRow).getByText('Casa Dos Aguas')

    // No focusable, activatable control anywhere in the row -- neither a
    // link nor a button, the two roles a real control here could take.
    expect(within(occupiedRow).queryByRole('link')).not.toBeInTheDocument()
    expect(within(occupiedRow).queryByRole('button')).not.toBeInTheDocument()
    expect(cabinNameNode.closest('a')).toBeNull()
    expect(cabinNameNode.closest('button')).toBeNull()

    // Clicking directly on the row's own text does nothing -- still on
    // Inicio, never the wizard.
    fireEvent.click(cabinNameNode)
    expect(screen.getByText(HOME_COPY.availabilityTitle)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: GUESTS_COPY.guestStepTitle })).not.toBeInTheDocument()
  })

  // Test 3 [order-of-operations regression guard]: the cabin and dates must
  // be committed to the draft store SYNCHRONOUSLY, in the Link's own
  // `onClick`, strictly before the navigation it triggers -- `Wizard.tsx`'s
  // step-3 guard (`draft.cabin === null || draft.dates === null`) would
  // otherwise redirect to step 1 on the very next render. `fireEvent.click`
  // (not `userEvent.click`, which layers in its own async pointer-event
  // sequence) dispatches the click and runs every synchronous handler
  // before returning, so reading the store IMMEDIATELY after -- with no
  // `await` in between -- proves the write already happened rather than
  // merely happening to finish before this assertion runs. If a future
  // change deferred the write (e.g. into a `useEffect` on the destination
  // step, or a microtask queued after the navigate call), this line would
  // read `null` here even though the eventual DOM (test 1) still ends up
  // correct -- exactly the race the hazard note warns about.
  it('commits the cabin and dates to the draft store synchronously, before the navigation fires (order-of-operations guard)', async () => {
    server.use(cabinsHandler(), clientsHandler(), reservationsHandler([]))

    await renderHomeAt('/inicio')
    await searchDates('2026-09-20', '2026-09-25')

    const bookLink = await screen.findByRole('link', {
      name: availabilityBookAction('Casa Azul', '20 al 25 de septiembre'),
    })

    fireEvent.click(bookLink)

    const { useWizardDraftStore } = await import('../reservations/wizard/store')
    const draftRightAfterClick = useWizardDraftStore.getState()
    expect(draftRightAfterClick.cabin).toEqual({ id: CASA_AZUL, name: 'Casa Azul' })
    expect(draftRightAfterClick.dates).toEqual({ checkIn: '2026-09-20', checkOut: '2026-09-25' })

    // And the deep entry actually lands on step 3 -- CabinStep's own
    // heading (step 1) never renders at all, proving the guard never had a
    // null to bounce on.
    await screen.findByRole('heading', { name: GUESTS_COPY.guestStepTitle })
    expect(screen.queryByRole('heading', { name: RESERVATION_WIZARD_COPY.cabinStepTitle })).not.toBeInTheDocument()
  })

  // Test 4 [TRIANGULATE]: a second, different pair of `PlainDate`s -- across
  // a year boundary, so any hidden re-derivation through a JS `Date` (design
  // D26) or an off-by-one in a reformat would show up here even though it
  // didn't in test 1's same-month range.
  it('carries the exact searched dates into the draft unchanged, across a year boundary', async () => {
    server.use(cabinsHandler(), clientsHandler(), reservationsHandler([]))

    const user = userEvent.setup()
    await renderHomeAt('/inicio')
    await searchDates('2026-12-30', '2027-01-03')

    const bookLink = await screen.findByRole('link', {
      name: availabilityBookAction('Casa Azul', '30 de diciembre al 3 de enero de 2027'),
    })
    await user.click(bookLink)

    await screen.findByRole('heading', { name: GUESTS_COPY.guestStepTitle })

    const { useWizardDraftStore } = await import('../reservations/wizard/store')
    expect(useWizardDraftStore.getState().dates).toEqual({ checkIn: '2026-12-30', checkOut: '2027-01-03' })
  })
})
