import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'
import { queryClient } from '../../../shared/mutation/queryClient'
import { RESERVATION_WIZARD_COPY } from '../../../shared/copy/reservations'
import { GUESTS_COPY } from '../../../shared/copy/guests'
import { SESSION_COPY } from '../../../shared/copy/session'

// tasks 5.24-5.31: the wizard as a whole, exercised through the REAL app
// `routeConfig` (matching `routes.test.tsx`'s own established pattern) --
// necessary for 5.30's own 401 case, which depends on `/login` existing in
// the same tree the redirect actually navigates to.

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'

function cabinsHandler() {
  return http.get('http://localhost:8000/properties', () =>
    HttpResponse.json([{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]),
  )
}

function emptyReservationsHandler() {
  return http.get('http://localhost:8000/reservations', () => HttpResponse.json([]))
}

function dashboardHandler() {
  return http.get('http://localhost:8000/dashboard/summary', () =>
    HttpResponse.json({ occupied_nights: 0, available_nights: 60 }),
  )
}

async function renderWizardAt(path: string) {
  const { routeConfig } = await import('../../../routes')
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

async function completeStep1() {
  await userEvent.click(await screen.findByRole('button', { name: 'Casa Azul' }))
}

async function completeStep2(entrada: string, salida: string) {
  await userEvent.click(await screen.findByTestId(`day-${entrada}`))
  await userEvent.click(await screen.findByTestId(`day-${salida}`))
  await userEvent.click(await screen.findByRole('button', { name: RESERVATION_WIZARD_COPY.seguir }))
}

describe('Wizard', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    queryClient.clear()
  })

  // task 5.24/5.25, `reservation-recording` spec "Wizard State Persists
  // Across Steps And Back Navigation".
  it('keeps step-2 dates intact after moving to step 3 and back', async () => {
    server.use(cabinsHandler(), emptyReservationsHandler())

    await renderWizardAt('/reserva/nueva/1')
    await completeStep1()
    await completeStep2('2026-09-08', '2026-09-12')

    // Now on step 3 (GuestStep).
    await screen.findByRole('heading', { name: GUESTS_COPY.guestStepTitle })
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.volver }))

    // Back on step 2 -- the previously chosen range must still be shown,
    // not cleared, with no re-tapping.
    const summary = await screen.findByRole('region', { name: RESERVATION_WIZARD_COPY.resumenLabel })
    expect(summary).toHaveTextContent('8/9')
    expect(summary).toHaveTextContent('12/9')
  })

  // task 5.26/5.27, `reservation-recording` spec "Saving Clears The Draft
  // And Leaves The Wizard".
  it('clears the draft on a successful save, so a fresh wizard entry starts empty', async () => {
    server.use(
      cabinsHandler(),
      emptyReservationsHandler(),
      dashboardHandler(),
      http.post('http://localhost:8000/clients', () =>
        HttpResponse.json(
          { id: 'cli-1', full_name: 'Ana', phone: '111', email: null, national_id: null, is_active: true },
          { status: 201 },
        ),
      ),
      http.post('http://localhost:8000/reservations', () => HttpResponse.json({ id: 'res-1' }, { status: 201 })),
    )

    await renderWizardAt('/reserva/nueva/1')
    await completeStep1()
    await completeStep2('2026-09-08', '2026-09-12')

    await userEvent.type(await screen.findByLabelText(GUESTS_COPY.phoneLabel), '111')
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.search }))
    await userEvent.click(await screen.findByRole('button', { name: GUESTS_COPY.seguir }))

    await userEvent.type(await screen.findByLabelText(RESERVATION_WIZARD_COPY.amountLabel), '45000')
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.guardar }))

    // A successful save navigates away from the wizard entirely (to
    // /inicio) -- the wizard's own step-1 heading is gone.
    await screen.findByText('Hola, Ana')

    const { useWizardDraftStore } = await import('./store')
    expect(useWizardDraftStore.getState()).toMatchObject({ cabin: null, dates: null, guest: null, priceMode: null, amount: null })
  })

  // task 5.28/5.29, `reservation-recording` spec "Saving Without
  // Connectivity Fails Visibly And Preserves The Draft".
  it('shows a could-not-save message and preserves every entry when saving fails from no connectivity', async () => {
    server.use(
      cabinsHandler(),
      emptyReservationsHandler(),
      http.post('http://localhost:8000/clients', () =>
        HttpResponse.json(
          { id: 'cli-1', full_name: 'Ana', phone: '111', email: null, national_id: null, is_active: true },
          { status: 201 },
        ),
      ),
      http.post('http://localhost:8000/reservations', () => HttpResponse.error()),
    )

    await renderWizardAt('/reserva/nueva/1')
    await completeStep1()
    await completeStep2('2026-09-08', '2026-09-12')

    await userEvent.type(await screen.findByLabelText(GUESTS_COPY.phoneLabel), '111')
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.search }))
    await userEvent.click(await screen.findByRole('button', { name: GUESTS_COPY.seguir }))

    await userEvent.type(await screen.findByLabelText(RESERVATION_WIZARD_COPY.amountLabel), '45000')
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.guardar }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar')

    const { useWizardDraftStore } = await import('./store')
    const draft = useWizardDraftStore.getState()
    expect(draft.cabin).not.toBeNull()
    expect(draft.dates).not.toBeNull()
    expect(draft.guest).not.toBeNull()
    // No automatic retry -- the shared `queryClient`'s own `mutations.retry:
    // false` default (D30) means exactly ONE POST was ever attempted, and
    // remains so; nothing here waits and retries on its own.
  })

  // task 5.30/5.31 [TRAP -- completes Phase 3's deferred proof]: a 401 mid-
  // wizard redirects to /login through the router, never window.location,
  // and the in-memory draft survives because of it.
  it('[TRAP] a 401 on step 3 redirects to /login, and the draft (cabin and dates) survives', async () => {
    server.use(
      cabinsHandler(),
      emptyReservationsHandler(),
      http.post('http://localhost:8000/clients', () =>
        HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
      ),
    )

    const { useSessionStore } = await import('../../session/store')
    useSessionStore.getState().setToken('a-valid-looking-token')

    // The SINGLETON `router` (`../../routes`'s own exported `router`,
    // `createBrowserRouter`), not a fresh `createMemoryRouter` instance --
    // `app/api/client.ts`'s 401 interceptor calls `.navigate()` on THAT
    // exact object (task 3.14), so rendering a different router instance
    // here would make the interceptor's call invisible to this test,
    // matching `client.test.tsx`'s own "real router, not a spy" test.
    const { router } = await import('../../../routes')
    await router.navigate('/reserva/nueva/1')
    render(<RouterProvider router={router} />)
    await completeStep1()
    await completeStep2('2026-09-08', '2026-09-12')

    await userEvent.type(await screen.findByLabelText(GUESTS_COPY.phoneLabel), '111')
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Ana')
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.search }))

    // A real 401 through the real router -- not a spied `navigate` call --
    // must land her on the real sign-in screen (matching `client.test.tsx`'s
    // own established "real router, not just a spy" discipline).
    expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
    expect(useSessionStore.getState().token).toBeNull()

    // The draft is in-memory (D29) and untouched by a router-only
    // navigation -- it must still hold the cabin and dates chosen before
    // the 401, with no code in this task needed to make that true.
    const { useWizardDraftStore } = await import('./store')
    const draft = useWizardDraftStore.getState()
    expect(draft.cabin).toEqual({ id: CASA_AZUL, name: 'Casa Azul' })
    expect(draft.dates).toEqual({ checkIn: '2026-09-08', checkOut: '2026-09-12' })

    useSessionStore.getState().clearToken()
    useWizardDraftStore.getState().reset()
  })
})
