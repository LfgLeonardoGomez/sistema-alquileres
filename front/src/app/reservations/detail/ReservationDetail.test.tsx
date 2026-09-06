import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  // A getter is allowed, not just a literal, so 6.40's refund can move
  // this value mid-test without a second copy of the fixture below.
  readonly paid_amount?: string | (() => string)
  readonly balance?: string
}

function reservationHandler(overrides: ReservationOverrides = {}) {
  const paidAmount = overrides.paid_amount ?? '200000.00'
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
      paid_amount: typeof paidAmount === 'function' ? paidAmount() : paidAmount,
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

  // 6.32/6.33, the spec's "A Cancelled Stay That Still Holds Money Says So,
  // Without Calling It A Debt". The owner's own words for this screen:
  // "que la cancelación deje registrar devoluciones, pero que no sea
  // obligatorio, que sea mas como un mensaje recordatorio que como una
  // obligacion".
  //
  // 6.3's three forbidden phrasings and 6.1's two error hooks are
  // re-asserted here against the NEW element on purpose. This reminder is
  // the one string in the app that could quietly turn a cancellation back
  // into a debt, and it is the only new copy that sits next to money.
  it('a cancelled stay that still holds money shows a reminder, and it is not a debt', async () => {
    server.use(reservationHandler({ status: 'cancelled', paid_amount: '100000.00', balance: '0.00' }))

    renderDetail()

    await waitFor(() => expect(screen.getByText(/todavía tenés \$ 100\.000 cobrados/)).toBeInTheDocument(), {
      timeout: 3000,
    })

    // Not a balance line: none of the three phrasings, and the `Saldo`
    // block still reads `$ 0` because `displayBalance()` is untouched.
    expect(screen.queryByText('Le falta pagar')).not.toBeInTheDocument()
    expect(screen.queryByText('Le tenés que devolver')).not.toBeInTheDocument()
    expect(screen.queryByText(/Debe/)).not.toBeInTheDocument()
    expect(screen.getByText('$ 0')).toBeInTheDocument()

    // A reminder, not a warning: this app's one error presentation is
    // `role="alert"`, and `data-tone="error"` is the styling hook a future
    // stylesheet would hang on. Neither may appear on a cancellation.
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(document.querySelectorAll('[data-tone="error"]')).toHaveLength(0)
  })

  // 6.34/6.35 [TRIANGULATE], the spec's "A cancelled stay that took in
  // nothing shows no reminder" -- the second corner, which is what proves
  // 6.33 reads the AMOUNT rather than the status.
  it('a cancelled stay that took in nothing shows no reminder', async () => {
    server.use(reservationHandler({ status: 'cancelled', paid_amount: '0.00', balance: '0.00' }))

    renderDetail()

    await waitFor(() => expect(screen.getByText('Pagado')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.queryByText(/todavía tenés/)).not.toBeInTheDocument()
  })

  // 6.36 [TRIANGULATE], the spec's "A stay that is not cancelled shows no
  // reminder" -- the third corner, so the gate cannot be satisfied by the
  // amount alone either. A live stay already has the balance block to say
  // where it stands; this reminder exists only because a cancelled one
  // does not.
  it('a confirmed stay with money taken in shows no reminder', async () => {
    server.use(reservationHandler({ status: 'confirmed', paid_amount: '100000.00', balance: '80000.00' }))

    renderDetail()

    await waitFor(() => expect(screen.getByText('Le falta pagar')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.queryByText(/todavía tenés/)).not.toBeInTheDocument()
  })

  // 6.37/6.38, the spec's "A cancelled stay offers the refund and nothing
  // else". Only the REFUND half of 6.15's action block survives
  // cancellation -- the owner asked for refunds specifically, and a
  // general unlock of that block is the failure mode this test exists to
  // catch. Enumerated the way 6.14's cancelled half is: no link on the
  // screen points at the edit route, whatever it happens to be labelled.
  it('a cancelled stay still holding money offers the refund, and nothing else', async () => {
    server.use(reservationHandler({ status: 'cancelled', paid_amount: '100000.00', balance: '0.00' }))

    renderDetail()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Devolución' })).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(screen.queryByRole('button', { name: 'Anotar un pago' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain(
      `/reserva/${RESERVATION}/editar`,
    )
  })

  // 6.40 [TRAP] / 6.41, the spec's "A refund that returns everything
  // retires the reminder without a reload".
  //
  // The trap is 6.11's, one screen over: the reminder is read from a
  // MOUNTED `useReservation` query, so a fixture whose `paid_amount` drops
  // server-side changes nothing on screen unless something explicitly
  // invalidates that query. Had this test navigated away and back instead,
  // TanStack Query's default `staleTime: 0` would have refetched on
  // remount and the reminder would have gone on its own -- passing against
  // code that implements none of this.
  //
  // The fixture does the SERVER's arithmetic (a refund is a negative
  // payment, so it lowers what the stay took in) rather than hardcoding
  // the outcome, which is what lets 6.42 reuse it for a partial refund.
  function installRefundableCancelledStay(startingPaidCentavos: number) {
    const bodies: Record<string, unknown>[] = []
    let paidCentavos = startingPaidCentavos
    server.use(
      reservationHandler({
        status: 'cancelled',
        balance: '0.00',
        paid_amount: () => (paidCentavos / 100).toFixed(2),
      }),
      http.post(`http://localhost:8000/reservations/${RESERVATION}/payments`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        paidCentavos += Math.round(Number(body.amount) * 100)
        return HttpResponse.json({ id: 'p-new' }, { status: 201 })
      }),
    )
    return bodies
  }

  async function recordRefundOf(amountPesos: string) {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Devolución' }))
    await user.type(screen.getByLabelText('Monto'), amountPesos)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
  }

  it('a refund recorded from a cancelled stay retires the reminder, with no reload', async () => {
    const bodies = installRefundableCancelledStay(10000000)

    renderDetail()

    await waitFor(() => expect(screen.getByText(/todavía tenés \$ 100\.000 cobrados/)).toBeInTheDocument(), {
      timeout: 3000,
    })

    await recordRefundOf('100000')

    // The same endpoint and the same sign rule as 6.7/6.8's sheet, because
    // it IS 6.7/6.8's sheet -- asserted on the request body, not on a spy.
    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
    expect(bodies[0]!.amount).toBe('-100000.00')

    // Never navigated away from, never remounted.
    await waitFor(() => expect(screen.queryByText(/todavía tenés/)).not.toBeInTheDocument(), { timeout: 3000 })
  })

  // 6.42/6.43 [TRIANGULATE], the spec's "A partial refund leaves the
  // reminder naming the remainder" -- the other half of "derived, never
  // dismissed", and precisely the case a boolean "ya la devolví" flag
  // would have got wrong: it would have hidden the reminder while
  // `$ 60.000` was still sitting with the owner.
  it('a partial refund leaves the reminder standing, naming what is left', async () => {
    const bodies = installRefundableCancelledStay(10000000)

    renderDetail()

    await waitFor(() => expect(screen.getByText(/todavía tenés \$ 100\.000 cobrados/)).toBeInTheDocument(), {
      timeout: 3000,
    })

    await recordRefundOf('40000')

    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
    expect(bodies[0]!.amount).toBe('-40000.00')

    await waitFor(() => expect(screen.getByText(/todavía tenés \$ 60\.000 cobrados/)).toBeInTheDocument(), {
      timeout: 3000,
    })
    // Still reachable, because there is still money to give back.
    expect(screen.getByRole('button', { name: 'Devolución' })).toBeInTheDocument()
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
