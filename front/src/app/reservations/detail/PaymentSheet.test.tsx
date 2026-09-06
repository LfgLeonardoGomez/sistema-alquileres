import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'

// task 6.7/6.8, `reservation-ledger` spec's "Recording A Payment And
// Recording A Refund Submit The Same Endpoint, Differing Only By Sign".
//
// The assertion is deliberately on the REQUEST BODY, not on a spy: the
// whole rule this pair of sheets exists to encode is what goes over the
// wire, and a mocked mutation would assert the test's own idea of it
// rather than the app's. MSW captures the real `POST` (D36).

const RESERVATION = 'd1111111-1111-1111-1111-111111111111'

// Dynamically imported, matching `lookups.test.ts`/`env.test.ts`'s own
// discipline: `PaymentSheet` transitively imports `app/api/client.ts`,
// which reads `env.ts` AT MODULE LOAD -- a static import at the top of this
// file is evaluated before `beforeEach` can set `VITE_API_BASE_URL`, and
// the whole file dies with "Missing required environment variable" before
// a single test runs. (Observed here, not merely anticipated.)
async function renderSheet(mode: 'payment' | 'refund') {
  const { PaymentSheet } = await import('./PaymentSheet')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PaymentSheet reservationId={RESERVATION} mode={mode} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

async function submitAmount(amountPesos: string): Promise<Record<string, unknown>> {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post(`http://localhost:8000/reservations/${RESERVATION}/payments`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ id: 'p-new' }, { status: 201 })
    }),
  )

  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Monto'), amountPesos)
  await user.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
  return bodies[0]!
}

describe('PaymentSheet', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('"Anotar un pago" submits a positive amount to the payments endpoint', async () => {
    await renderSheet('payment')
    expect(screen.getByRole('heading', { name: 'Anotar un pago' })).toBeInTheDocument()

    const body = await submitAmount('10000')

    expect(body.amount).toBe('10000.00')
    expect(body.method).toBe('cash')
  })

  // [TRIANGULATE] the same form, the same endpoint, the opposite sign --
  // the spec's own scenario: "GIVEN the owner enters 10000 into the
  // 'Devolución' sheet ... THEN the request MUST submit amount: -10000".
  it('"Devolución" submits the negated amount to the same endpoint', async () => {
    await renderSheet('refund')
    expect(screen.getByRole('heading', { name: 'Devolución' })).toBeInTheDocument()

    const body = await submitAmount('10000')

    expect(body.amount).toBe('-10000.00')
    expect(body.method).toBe('cash')
  })
})
