import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../test/setup'
import { parsePlainDate } from '../../../shared/date/parsePlainDate'

// tasks 6.9-6.13, `reservation-ledger` spec's "Cancelling Requires
// Explicit Confirmation And Frees The Nights Immediately" and "Cancellation
// Preserves Payment History" -- handoff screen 07.

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'
const GUEST = 'c1111111-1111-1111-1111-111111111111'
const RESERVATION = 'd1111111-1111-1111-1111-111111111111'

// Dynamically imported for the reason `PaymentSheet.test.tsx` records:
// this component transitively imports `app/api/client.ts`, which reads
// `env.ts` at module load, before `beforeEach` can set it.
async function renderCancelSheet(onClose: () => void) {
  const { CancelSheet } = await import('./CancelSheet')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CancelSheet
        reservationId={RESERVATION}
        checkIn={parsePlainDate('2026-09-03')}
        checkOut={parsePlainDate('2026-09-07')}
        cabinName="Casa Azul"
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
}

function captureCancelCalls(): string[] {
  const calls: string[] = []
  server.use(
    http.post(`http://localhost:8000/reservations/${RESERVATION}/cancel`, ({ request }) => {
      calls.push(request.url)
      return HttpResponse.json({ id: RESERVATION, status: 'cancelled' })
    }),
  )
  return calls
}

describe('CancelSheet', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // 6.9/6.10, the spec's own scenario: "WHEN the owner taps 'No, dejarla
  // como está' THEN no request MUST be sent and the reservation MUST
  // remain unchanged."
  it('declining sends no request at all and leaves the reservation alone', async () => {
    const calls = captureCancelCalls()
    const onClose = vi.fn()
    await renderCancelSheet(onClose)

    // The sheet names the range and the cabin before she decides -- screen
    // 07's body, verbatim.
    expect(screen.getByText('¿Cancelás esta reserva?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Las noches del 3 al 7 de septiembre en Casa Azul quedan libres para otra persona. Los pagos anotados quedan guardados.',
      ),
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'No, dejarla como está' }))

    expect(calls).toEqual([])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('confirming posts to the cancel endpoint', async () => {
    const calls = captureCancelCalls()
    await renderCancelSheet(() => {})

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }))

    await waitFor(() => expect(calls).toHaveLength(1), { timeout: 3000 })
    expect(calls[0]).toBe(`http://localhost:8000/reservations/${RESERVATION}/cancel`)
  })
})

// --- 6.11-6.13: the freed nights, and the surviving payments ------------
//
// The reservation calendar is rendered ALONGSIDE the sheet, in one tree
// under one `QueryClientProvider`, and stays MOUNTED across the
// cancellation. That is deliberate and it is what makes 6.11 a real trap:
// if the calendar were unmounted and remounted instead (navigating away
// and back), TanStack Query's default `staleTime: 0` would refetch on
// mount and the nights would free themselves with no invalidation
// anywhere -- the test would pass against code that does not implement the
// requirement. A live, mounted calendar can only learn about the
// cancellation if something explicitly invalidates its query.

function reservationsForCabinHandler(isCancelled: () => boolean) {
  return http.get('http://localhost:8000/reservations', ({ request }) => {
    if (new URL(request.url).searchParams.get('property_id') !== CASA_AZUL) return HttpResponse.json([])
    return HttpResponse.json([
      {
        id: RESERVATION,
        client_id: GUEST,
        check_in: '2026-09-03',
        check_out: '2026-09-07',
        status: isCancelled() ? 'cancelled' : 'confirmed',
        balance: '0.00',
      },
    ])
  })
}

function paymentsHandler() {
  return http.get(`http://localhost:8000/reservations/${RESERVATION}/payments`, () =>
    HttpResponse.json([
      { id: 'p-1', amount: '60000.00', method: 'cash', paid_on: '2026-08-12', note: 'seña' },
      { id: 'p-2', amount: '40000.00', method: 'transfer', paid_on: '2026-09-03', note: null },
    ]),
  )
}

async function renderCalendarBesideSheet() {
  const { CalendarScreen } = await import('../../calendar/CalendarScreen')
  const { CancelSheet } = await import('./CancelSheet')
  const { PaymentsList } = await import('./PaymentsList')
  const { usePayments } = await import('../usePayments')

  function Pagos() {
    const payments = usePayments(RESERVATION)
    return <PaymentsList payments={payments.data ?? []} />
  }

  function CalendarAndSheet() {
    return (
      <>
        <CalendarScreen />
        <CancelSheet
          reservationId={RESERVATION}
          checkIn={parsePlainDate('2026-09-03')}
          checkOut={parsePlainDate('2026-09-07')}
          cabinName="Casa Azul"
          onClose={() => {}}
        />
        <Pagos />
      </>
    )
  }

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '/calendario', Component: CalendarAndSheet }], {
    initialEntries: [`/calendario?cabana=${CASA_AZUL}&mes=2026-09`],
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('cancelling frees the nights on a live calendar', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  function installHandlers() {
    let cancelled = false
    server.use(
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]),
      ),
      http.get('http://localhost:8000/clients', () =>
        HttpResponse.json([
          { id: GUEST, full_name: 'Marta González', phone: '11 2233 4455', email: null, national_id: null, is_active: true },
        ]),
      ),
      reservationsForCabinHandler(() => cancelled),
      paymentsHandler(),
      http.post(`http://localhost:8000/reservations/${RESERVATION}/cancel`, () => {
        // The cancel endpoint moves `status` and NOTHING else -- the
        // payments handler above is untouched by it, which is 6.13's whole
        // proof expressed as a fixture rather than as an assertion.
        cancelled = true
        return HttpResponse.json({ id: RESERVATION, status: 'cancelled' })
      }),
    )
  }

  // 6.11 [TRAP] / 6.12, the spec's own scenario: "THEN the reservation
  // calendar for Casa Azul MUST stop showing those nights as occupied
  // without the owner reloading the page."
  it('the mounted calendar stops showing the cancelled nights as occupied, with no reload', async () => {
    installHandlers()

    await renderCalendarBesideSheet()

    await waitFor(() => expect(screen.getByTestId('day-2026-09-04').getAttribute('data-occupied')).toBe('true'), {
      timeout: 3000,
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }))

    // Every night of the stay, not just one -- 03 through 06, the half-open
    // range's own nights. `PrivateMonthCalendar` writes `data-occupied` as
    // `'true' : undefined`, so a freed night carries NO attribute at all
    // rather than a literal `'false'` -- asserted as absence, which is what
    // the component actually renders.
    await waitFor(() => expect(screen.getByTestId('day-2026-09-04').getAttribute('data-occupied')).toBeNull(), {
      timeout: 3000,
    })
    expect(screen.getByTestId('day-2026-09-03').getAttribute('data-occupied')).toBeNull()
    expect(screen.getByTestId('day-2026-09-06').getAttribute('data-occupied')).toBeNull()
    expect(screen.queryByText('Marta González')).not.toBeInTheDocument()
  })

  // 6.13 [TEST], not a cycle: "6.6/6.12's design touches only `status`,
  // never the payments table, so this cannot fail given that construction
  // -- it is proof, not a test." Written and run anyway, because the
  // construction it rests on is a THREE-part one and each part is a thing
  // a later phase could quietly break: the cancel endpoint moves only
  // `status`; `PaymentsList` filters on nothing at all; and 6.12's
  // invalidation refetches the payments list rather than dropping it. If
  // any future change makes cancellation hide payment history, this fails.
  it('both payments recorded before the cancellation are still listed afterwards', async () => {
    installHandlers()

    await renderCalendarBesideSheet()

    await waitFor(() => expect(screen.getByText(/12\/8 · seña — \$ 60\.000/)).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText(/3\/9 · Transferencia — \$ 40\.000/)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }))

    // The nights are freed -- i.e. the cancellation really happened and
    // really propagated -- and the two payments are still there anyway.
    await waitFor(() => expect(screen.getByTestId('day-2026-09-04').getAttribute('data-occupied')).toBeNull(), {
      timeout: 3000,
    })
    expect(screen.getByText(/12\/8 · seña — \$ 60\.000/)).toBeInTheDocument()
    expect(screen.getByText(/3\/9 · Transferencia — \$ 40\.000/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
