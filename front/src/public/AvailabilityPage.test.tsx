import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Temporal } from 'temporal-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/setup'
import { PUBLIC_COPY } from '../shared/copy/public'

// design D31/D28 + the public-availability-page and month-calendar-rendering
// specs: the public page is independently shippable (no auth, no wizard),
// sends an explicit `from`/`to` window on every fetch (the endpoint has no
// default), narrows its filter locally over the already-fetched response,
// leaks no private data structurally, and shows every occupied range with
// identical neutral treatment.

const CASA_AZUL_ID = 'a1111111-1111-1111-1111-111111111111'
const DOS_AGUAS_ID = 'b2222222-2222-2222-2222-222222222222'

function availabilityHandler(onRequest?: (url: URL) => void) {
  return http.get('http://localhost:8000/public/:slug/availability', ({ request }) => {
    const url = new URL(request.url)
    onRequest?.(url)
    return HttpResponse.json([
      {
        property_id: CASA_AZUL_ID,
        name: 'Casa Azul',
        occupied: [
          { check_in: '2026-09-10', check_out: '2026-09-12' },
          { check_in: '2026-09-25', check_out: '2026-09-27' },
        ],
      },
      {
        property_id: DOS_AGUAS_ID,
        name: 'Dos Aguas',
        occupied: [{ check_in: '2026-09-20', check_out: '2026-09-22' }],
      },
    ])
  })
}

describe('AvailabilityPage', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    delete (import.meta.env as Record<string, string | undefined>).VITE_WHATSAPP_NUMBER
    // Deterministic "today", the same mocking technique as 1.5's
    // `todayAR.test.ts` -- a real Temporal zone conversion inside the spy,
    // not a hand-rolled fake.
    vi.spyOn(Temporal.Now, 'plainDateISO').mockImplementation((timeZone) =>
      Temporal.Instant.from('2026-09-04T02:30:00Z').toZonedDateTimeISO(timeZone ?? 'UTC').toPlainDate(),
    )
    vi.resetModules()
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    vi.restoreAllMocks()
    cleanup()
  })

  it('sends both from and to on the first request on mount', async () => {
    const requests: URL[] = []
    server.use(availabilityHandler((url) => requests.push(url)))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]?.searchParams.get('from')).toBe('2026-09-01')
    expect(requests[0]?.searchParams.get('to')).toBe('2026-10-01')
  })

  it('re-issues a request for October window when navigating to October', async () => {
    const requests: URL[] = []
    server.use(availabilityHandler((url) => requests.push(url)))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    await waitFor(() => expect(requests).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: PUBLIC_COPY.nextMonth }))

    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.searchParams.get('from')).toBe('2026-10-01')
    expect(requests[1]?.searchParams.get('to')).toBe('2026-11-01')
  })

  it('selecting a single cabin narrows the display without sending a new request', async () => {
    let requestCount = 0
    server.use(availabilityHandler(() => (requestCount += 1)))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    await waitFor(() => expect(requestCount).toBe(1))

    // With "Las dos" (intersection, the default) selected, Casa Azul's
    // 10-11/9 nights are NOT occupied on the public calendar, because Dos
    // Aguas is free those nights (D28's `Las dos` trap: intersection, not
    // union).
    await waitFor(() => {
      const cell = screen.getByTestId('day-2026-09-10')
      expect(cell.dataset.occupied).not.toBe('true')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Casa Azul' }))

    // Still exactly one request -- the filter is local state over data
    // already in hand.
    expect(requestCount).toBe(1)

    // Now Casa Azul's own occupied night shows occupied.
    await waitFor(() => {
      const cell = screen.getByTestId('day-2026-09-10')
      expect(cell.dataset.occupied).toBe('true')
    })
    // Dos Aguas's own occupied night (20/9) must NOT show, now that only
    // Casa Azul is displayed.
    expect(screen.getByTestId('day-2026-09-20').dataset.occupied).not.toBe('true')
  })

  // [TRAP] the client-side analogue of `back/tests/test_public_contract.py`:
  // MSW seeds distinctive guest/phone/price strings on the SAME response the
  // page renders from (simulating a backend that leaked extra fields), and
  // none of them may reach the DOM -- attributes and comments included.
  // This holds structurally here: `public/api.ts`'s decode step only ever
  // reads `property_id`/`name`/`occupied`, so an extra field cannot reach a
  // screen even if present on the wire, the same mechanism as `ApiError`
  // lacking `detail` (1.17/D32).
  it('never renders private data leaked onto the availability response', async () => {
    const distinctiveName = 'Zzyzx Confidential Guest Wonderthorpe'
    const distinctivePhone = '+5491100009999'
    const distinctivePrice = '13371.00'

    server.use(
      http.get('http://localhost:8000/public/:slug/availability', () =>
        HttpResponse.json([
          {
            property_id: CASA_AZUL_ID,
            name: 'Casa Azul',
            occupied: [{ check_in: '2026-09-10', check_out: '2026-09-12' }],
            // Fields the real backend's `PublicAvailability` schema forbids
            // (`extra="forbid"`, `back/app/schemas/public.py`) but the
            // frontend must not rely on the wire ever actually agreeing --
            // its own render layer is the second, independent defence.
            guest_name: distinctiveName,
            phone: distinctivePhone,
            price: distinctivePrice,
          },
        ]),
      ),
    )

    const { AvailabilityPage } = await import('./AvailabilityPage')
    const { container } = render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    await waitFor(() => expect(screen.getByTestId('day-2026-09-10').dataset.occupied).toBe('true'))

    expect(container.innerHTML).not.toContain(distinctiveName)
    expect(container.innerHTML).not.toContain(distinctivePhone)
    expect(container.innerHTML).not.toContain(distinctivePrice)
  })

  it('renders two non-adjacent occupied ranges with identical neutral fill', async () => {
    server.use(availabilityHandler())

    const { AvailabilityPage } = await import('./AvailabilityPage')
    render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Casa Azul' }))

    const firstRange = await screen.findByTestId('day-2026-09-10')
    const secondRange = screen.getByTestId('day-2026-09-25')

    expect(firstRange.dataset.occupied).toBe('true')
    expect(secondRange.dataset.occupied).toBe('true')
    // Same class list -- no per-stay identity, no per-stay colour: the
    // public calendar cannot tell one occupied range from another.
    expect(firstRange.className).toBe(secondRange.className)
  })

  it('does not render the WhatsApp button when no number is configured', async () => {
    server.use(availabilityHandler())
    delete (import.meta.env as Record<string, string | undefined>).VITE_WHATSAPP_NUMBER

    const { AvailabilityPage } = await import('./AvailabilityPage')
    render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    await screen.findByRole('group', { name: PUBLIC_COPY.filterLabel })
    expect(screen.queryByText(PUBLIC_COPY.whatsappButton)).not.toBeInTheDocument()
  })

  it('links to the configured number’s wa.me address when one is set', async () => {
    server.use(availabilityHandler())
    import.meta.env.VITE_WHATSAPP_NUMBER = '5491122334455'

    const { AvailabilityPage } = await import('./AvailabilityPage')
    render(<AvailabilityPage slug="mar-del-tuyu-cabins" />)

    const link = await screen.findByRole('link', { name: PUBLIC_COPY.whatsappButton })
    expect(link).toHaveAttribute('href', 'https://wa.me/5491122334455')
  })
})
