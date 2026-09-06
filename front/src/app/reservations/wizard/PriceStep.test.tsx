import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'
import { RESERVATION_WIZARD_COPY } from '../../../shared/copy/reservations'

// tasks 5.20-5.23, `reservation-recording` spec "Price Entry Is Mutually
// Exclusive" + "A Per-Night Price Rescales On A Date Change; A Stay-Total
// Price Does Not". Fixture dates (`2026-09-08` → `2026-09-12`, 4 nights)
// match this run's own established convention elsewhere in this phase.

const CABIN = { id: 'cab-1', name: 'Casa Azul' }
const GUEST = { id: 'cli-1', fullName: 'Ana', phone: '111' }
const DATES_4_NIGHTS = { checkIn: '2026-09-08', checkOut: '2026-09-12' } as never
const DATES_5_NIGHTS = { checkIn: '2026-09-08', checkOut: '2026-09-13' } as never

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PriceStepUnderTest: any

function renderPriceStep(overrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const props = {
    cabin: CABIN,
    dates: DATES_4_NIGHTS,
    guest: GUEST,
    initialPriceMode: null,
    initialAmount: null,
    onBack: () => {},
    onPriceChange: () => {},
    onSaved: () => {},
    ...overrides,
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <PriceStepUnderTest {...props} />
    </QueryClientProvider>,
  )
}

describe('PriceStep', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./PriceStep')
    PriceStepUnderTest = mod.PriceStep
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('submits price_total only -- never price_per_night -- after switching modes and entering a different amount', async () => {
    let requestBody: Record<string, unknown> | null = null
    server.use(
      http.post('http://localhost:8000/reservations', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 'res-1' }, { status: 201 })
      }),
    )

    renderPriceStep()

    await userEvent.type(screen.getByLabelText(RESERVATION_WIZARD_COPY.amountLabel), '45000')
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.total }))
    await userEvent.clear(screen.getByLabelText(RESERVATION_WIZARD_COPY.amountLabel))
    await userEvent.type(screen.getByLabelText(RESERVATION_WIZARD_COPY.amountLabel), '180000')
    await userEvent.click(screen.getByRole('button', { name: RESERVATION_WIZARD_COPY.guardar }))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requestBody).not.toBeNull()
    expect(requestBody).toMatchObject({ price_total: '180000.00', price_per_night: null })
    expect(requestBody).not.toHaveProperty('price_per_night', '180000.00')
  })

  // task 5.22 [TRAP]: a per-night stay rescales live; a stay-total stay does not.
  it('[TRAP] recomputes the total live in per-night mode when the stay is extended, and leaves a stay-total amount unchanged', async () => {
    const { rerender } = renderPriceStep({ initialPriceMode: 'per_night', initialAmount: 4500000 })

    expect(await screen.findByText(/\$\s?180\.000/)).toBeInTheDocument()

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      <QueryClientProvider client={queryClient}>
        <PriceStepUnderTest
          cabin={CABIN}
          dates={DATES_5_NIGHTS}
          guest={GUEST}
          initialPriceMode="per_night"
          initialAmount={4500000}
          onBack={() => {}}
          onPriceChange={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/\$\s?225\.000/)).toBeInTheDocument()
  })

  it('[TRAP triangulation] a stay-total amount is left unchanged when the stay is extended', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <PriceStepUnderTest
          cabin={CABIN}
          dates={DATES_4_NIGHTS}
          guest={GUEST}
          initialPriceMode="total"
          initialAmount={18000000}
          onBack={() => {}}
          onPriceChange={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByDisplayValue('180000')).toBeInTheDocument()

    rerender(
      <QueryClientProvider client={queryClient}>
        <PriceStepUnderTest
          cabin={CABIN}
          dates={DATES_5_NIGHTS}
          guest={GUEST}
          initialPriceMode="total"
          initialAmount={18000000}
          onBack={() => {}}
          onPriceChange={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
    )

    // Still the same typed amount -- no per-night line exists in this mode
    // at all, and nothing multiplies it by the new night count.
    expect(screen.getByDisplayValue('180000')).toBeInTheDocument()
    expect(screen.queryByText(/225\.000/)).not.toBeInTheDocument()
  })
})
