import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'

// tasks 6.1-6.4/6.14-6.15, `reservation-ledger` spec's "Balance Reads As A
// Normal State In Either Direction", "A Cancelled Reservation Shows No
// Amount Owed" and "Editing Is Reachable Only While The Reservation Is Not
// Cancelled" -- handoff screen 06.
//
// Rendered through a real router (`createMemoryRouter`) because the screen
// reads its own `:id` from the URL, matching `CalendarScreen.test.tsx`'s
// own established pattern; the local `QueryClientProvider` is the same
// isolated-component convention that file uses.

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'
const GUEST = 'c1111111-1111-1111-1111-111111111111'
const RESERVATION = 'd1111111-1111-1111-1111-111111111111'

function cabinsHandler() {
  return http.get('http://localhost:8000/properties', () =>
    HttpResponse.json([{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]),
  )
}

function clientsHandler() {
  return http.get('http://localhost:8000/clients', () =>
    HttpResponse.json([{ id: GUEST, full_name: 'Marta González', phone: '11 2233 4455', email: null, national_id: null, is_active: true }]),
  )
}

type ReservationOverrides = {
  readonly status?: string
  readonly effective_total?: string
  readonly paid_amount?: string
  readonly balance?: string
}

function reservationHandler(overrides: ReservationOverrides = {}) {
  return http.get(`http://localhost:8000/reservations/${RESERVATION}`, () =>
    HttpResponse.json({
      id: RESERVATION,
      property_id: CASA_AZUL,
      client_id: GUEST,
      check_in: '2026-09-03',
      check_out: '2026-09-07',
      status: overrides.status ?? 'confirmed',
      price_per_night: null,
      price_total: '180000.00',
      paid_amount: overrides.paid_amount ?? '200000.00',
      created_at: '2026-08-01T00:00:00Z',
      effective_total: overrides.effective_total ?? '180000.00',
      balance: overrides.balance ?? '-20000.00',
      is_completed: false,
    }),
  )
}

function paymentsHandler(payments: readonly unknown[] = []) {
  return http.get(`http://localhost:8000/reservations/${RESERVATION}/payments`, () => HttpResponse.json(payments))
}

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/reserva/:id', lazy: async () => ({ Component: (await import('./ReservationDetail')).ReservationDetail }) }],
    { initialEntries: [`/reserva/${RESERVATION}`] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('ReservationDetail', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    server.use(cabinsHandler(), clientsHandler(), paymentsHandler())
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // 6.1/6.2: an overpaid stay is a NORMAL state -- the handoff's own words,
  // "If the balance is negative the same block must read 'Le tenés que
  // devolver' -- a normal state, never an error."
  it('an overpaid stay reads as a refund owed, with no error indicator anywhere', async () => {
    server.use(reservationHandler())

    renderDetail()

    await waitFor(() => expect(screen.getByText('Le tenés que devolver')).toBeInTheDocument(), { timeout: 3000 })
    // The absolute amount, never a literal `-$` (4.18's own rule).
    expect(screen.getByText('$ 20.000')).toBeInTheDocument()
    expect(screen.queryByText(/-\s*\$/)).not.toBeInTheDocument()

    // No error-styled element anywhere: `role="alert"` is this codebase's
    // one error presentation (`PriceStep.tsx`, `GuestStep.tsx`), and
    // `data-tone="error"` is the styling hook a future stylesheet would
    // hang on -- neither may appear on a balance the owner simply owes
    // back.
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(document.querySelectorAll('[data-tone="error"]')).toHaveLength(0)

    // The two rows the balance is derived from are shown as themselves.
    expect(screen.getByText('$ 180.000')).toBeInTheDocument()
    expect(screen.getByText('$ 200.000')).toBeInTheDocument()
  })

  // 6.3/6.4 [TRIANGULATE, reusing 4.18's helper]: the same screen, the
  // opposite input. The API is made to report a NONZERO balance for a
  // CANCELLED stay -- the exact shape of the backend defect that
  // `frontend-api-alignment` fixed -- and the screen must still owe
  // nothing, because the frontend's correctness here does not depend on
  // the backend's (`reservation-ledger` spec's own words).
  it('a cancelled stay with a nonzero reported balance shows nothing owed in either direction', async () => {
    server.use(reservationHandler({ status: 'cancelled', paid_amount: '100000.00', balance: '80000.00' }))

    renderDetail()

    await waitFor(() => expect(screen.getByText('Pagado')).toBeInTheDocument(), { timeout: 3000 })

    // None of the three amount-owed phrasings this app has, anywhere on
    // the screen -- the detail's own two, plus the reservation calendar's
    // "Debe" prefix, which is the wording any list row referencing this
    // stay would use.
    expect(screen.queryByText('Le falta pagar')).not.toBeInTheDocument()
    expect(screen.queryByText('Le tenés que devolver')).not.toBeInTheDocument()
    expect(screen.queryByText(/Debe/)).not.toBeInTheDocument()

    // And the number itself is zeroed, not merely unlabelled: the API's
    // own `$ 80.000` must not reach the screen at all.
    expect(screen.getByText('$ 0')).toBeInTheDocument()
    expect(screen.queryByText('$ 80.000')).not.toBeInTheDocument()
  })

  // 6.14/6.15, the spec's two paired scenarios: "GIVEN a cancelled
  // reservation's detail view / WHEN its available actions are enumerated
  // / THEN none MUST offer to edit dates or price", and its opposite for a
  // non-cancelled one.
  //
  // D34: "A cancelled reservation offers no editing -- in two places,
  // because a hidden button is not a closed route." This is the first of
  // those two places; the route guard is 6.30/6.31's, in the next commit.
  it('a non-cancelled reservation offers editing, and its actions are reachable', async () => {
    server.use(reservationHandler())

    renderDetail()

    await waitFor(() => expect(screen.getByRole('link', { name: 'Editar la reserva' })).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(screen.getByRole('link', { name: 'Editar la reserva' })).toHaveAttribute(
      'href',
      `/reserva/${RESERVATION}/editar`,
    )
    expect(screen.getByRole('button', { name: 'Anotar un pago' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Devolución' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('a cancelled reservation offers no way to edit', async () => {
    server.use(reservationHandler({ status: 'cancelled', balance: '0.00' }))

    renderDetail()

    await waitFor(() => expect(screen.getByText('Pagado')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.queryByRole('link', { name: 'Editar la reserva' })).not.toBeInTheDocument()
    // Enumerated, not spot-checked: NO action on this screen offers to
    // change dates or price, whatever it happens to be called.
    expect(screen.queryAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain(
      `/reserva/${RESERVATION}/editar`,
    )
  })
})
