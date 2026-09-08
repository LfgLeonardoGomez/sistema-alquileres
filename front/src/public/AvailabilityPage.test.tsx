import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { ComponentType } from 'react'
import { Temporal } from 'temporal-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/setup'
import { cabinPhotoLabel, PUBLIC_COPY } from '../shared/copy/public'

// Renders a component the way `routes.tsx` (task 2.32) actually mounts
// `AvailabilityPage` in production: via a router, with the slug carried by
// the URL's own `:slug` param -- never a directly-passed prop (task 2.34:
// the component takes no `slug` prop at all and reads `useParams()`
// itself).
function renderAtSlug(Component: ComponentType, slug: string) {
  const router = createMemoryRouter([{ path: '/disponibilidad/:slug', Component }], {
    initialEntries: [`/disponibilidad/${slug}`],
  })
  return render(<RouterProvider router={router} />)
}

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

// design D37 (corrected) + the Phase 2 addendum's gap 2: the WhatsApp
// number is per-tenant, from `GET /public/{slug}/contact` -- `bySlug` maps
// a slug to its own number (or `null`), the same per-tenant shape the real
// endpoint carries.
function contactHandler(bySlug: Record<string, string | null>) {
  return http.get('http://localhost:8000/public/:slug/contact', ({ params }) => {
    const slug = params.slug as string
    return HttpResponse.json({ name: slug, whatsapp: bySlug[slug] ?? null })
  })
}

describe('AvailabilityPage', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    // Task 2.39: `AvailabilityPage` now always fetches
    // `GET /public/{slug}/contact` on mount, so every test in this file
    // needs a handler for it, not only the WhatsApp-specific ones. A
    // default of "no number for anyone" here, overridden per-test via
    // `server.use(contactHandler(...))` (MSW's own last-registered-wins
    // rule) where a test actually cares about the number.
    server.use(contactHandler({}))
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
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]?.searchParams.get('from')).toBe('2026-09-01')
    expect(requests[0]?.searchParams.get('to')).toBe('2026-10-01')
  })

  it('re-issues a request for October window when navigating to October', async () => {
    const requests: URL[] = []
    server.use(availabilityHandler((url) => requests.push(url)))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

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
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

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
    const { container } = renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await waitFor(() => expect(screen.getByTestId('day-2026-09-10').dataset.occupied).toBe('true'))

    expect(container.innerHTML).not.toContain(distinctiveName)
    expect(container.innerHTML).not.toContain(distinctivePhone)
    expect(container.innerHTML).not.toContain(distinctivePrice)
  })

  it('renders two non-adjacent occupied ranges with identical neutral fill', async () => {
    server.use(availabilityHandler())

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await userEvent.click(await screen.findByRole('button', { name: 'Casa Azul' }))

    const firstRange = await screen.findByTestId('day-2026-09-10')
    const secondRange = screen.getByTestId('day-2026-09-25')

    expect(firstRange.dataset.occupied).toBe('true')
    expect(secondRange.dataset.occupied).toBe('true')
    // Same class list -- no per-stay identity, no per-stay colour: the
    // public calendar cannot tell one occupied range from another.
    expect(firstRange.className).toBe(secondRange.className)
  })

  // Replaces the old build-time-env-var version of this test (2.28), per
  // task 2.39: the number now comes from `GET /public/{slug}/contact`, not
  // the deleted build-time WhatsApp number env var.
  it('does not render the WhatsApp button when the tenant has no number set', async () => {
    server.use(availabilityHandler(), contactHandler({ 'mar-del-tuyu-cabins': null }))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await screen.findByRole('group', { name: PUBLIC_COPY.filterLabel })
    expect(screen.queryByText(PUBLIC_COPY.whatsappButton)).not.toBeInTheDocument()
  })

  // Replaces the old build-time-env-var version of this test (2.29), per
  // task 2.39.
  it('links to the tenant’s own wa.me address when the contact endpoint reports one', async () => {
    server.use(availabilityHandler(), contactHandler({ 'mar-del-tuyu-cabins': '5491122334455' }))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    const link = await screen.findByRole('link', { name: PUBLIC_COPY.whatsappButton })
    expect(link).toHaveAttribute('href', 'https://wa.me/5491122334455')
  })

  // Task 2.33/2.34, the Phase 2 addendum's gap 1 follow-through: the page
  // must read its slug from the route param, not a prop -- so it cannot be
  // mounted with a slug its URL does not carry. Proven behaviourally: mount
  // ONLY via a router carrying a real slug in its URL, with no `slug` prop
  // passed anywhere, and confirm the request the page issues actually uses
  // that URL's slug. Before 2.34, `AvailabilityPage` still requires a
  // `slug` prop, so an unsupplied one is `undefined` at runtime and the
  // request path degrades to the literal string "undefined" -- a real,
  // meaningful failure, not a contrived one.
  it('reads its slug from the route param rather than a prop', async () => {
    const requestedSlugs: string[] = []
    server.use(
      http.get('http://localhost:8000/public/:slug/availability', ({ params }) => {
        requestedSlugs.push(params.slug as string)
        return HttpResponse.json([])
      }),
    )

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'casa-aya')

    await waitFor(() => expect(requestedSlugs).toHaveLength(1))
    expect(requestedSlugs[0]).toBe('casa-aya')
  })

  // [TRAP] task 2.38, the Phase 2 addendum's gap 2: the multi-tenant leak a
  // build-time global would cause, pinned by a test before the code could
  // ever regress into it. Two tenants, two numbers, one build -- if the
  // component read from any shared/global source instead of the per-
  // request contact endpoint, both would show the SAME number.
  //
  // Historical note, not a live concern: at RED time (task 2.38, before
  // 2.39 deleted it) this test also set a stale build-time WhatsApp number
  // to prove the still-live env-var branch was never consulted once the
  // endpoint had an answer -- literal RED output recorded in `tasks.md`'s
  // 2.38 entry showed both tenants rendering that SAME stale number. Now
  // that the variable and its branch are gone (2.39), there is nothing
  // left to fall back to, so the reference is removed rather than kept as
  // dead test setup.
  it('renders its own tenant’s WhatsApp number and never another tenant’s', async () => {
    server.use(
      availabilityHandler(),
      contactHandler({ 'casa-azul-cabins': '5491111111111', 'dos-aguas-cabins': '5492222222222' }),
    )

    const { AvailabilityPage } = await import('./AvailabilityPage')

    const { unmount } = renderAtSlug(AvailabilityPage, 'casa-azul-cabins')
    const linkA = await screen.findByRole('link', { name: PUBLIC_COPY.whatsappButton })
    expect(linkA).toHaveAttribute('href', 'https://wa.me/5491111111111')
    unmount()

    renderAtSlug(AvailabilityPage, 'dos-aguas-cabins')
    const linkB = await screen.findByRole('link', { name: PUBLIC_COPY.whatsappButton })
    expect(linkB).toHaveAttribute('href', 'https://wa.me/5492222222222')
  })

  // [TRAP] the other half of the same gap: a tenant whose contact reports
  // `whatsapp: null` renders NO button -- not a fallback number (there is
  // none to fall back to, 2.39), not a disabled button, not a hidden-but-
  // mounted one.
  it('renders no button for a tenant with no number set', async () => {
    server.use(availabilityHandler(), contactHandler({ 'casa-aya': null }))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'casa-aya')

    await screen.findByRole('group', { name: PUBLIC_COPY.filterLabel })
    expect(screen.queryByRole('link', { name: PUBLIC_COPY.whatsappButton })).not.toBeInTheDocument()
    expect(screen.queryByText(PUBLIC_COPY.whatsappButton)).not.toBeInTheDocument()
  })

  it('mobile (no matchMedia): renders only the primary month, never a second desktop panel', async () => {
    server.use(availabilityHandler(), contactHandler({}))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await screen.findByTestId('day-2026-09-10')
    // October cannot appear from September's own grid (`getMonthGrid` only
    // emits cells for the target month) -- its presence would mean a
    // second, October, `PublicMonthCalendar` mounted alongside this one.
    expect(screen.queryByTestId('day-2026-10-01')).not.toBeInTheDocument()
  })

  // [TRAP] the same defect class as `HOME_COPY.greeting`'s hardcoded "Hola,
  // Ana": the old "Las casas" tiles named one tenant's own cabins
  // ("Casa Azul", "Dos Aguas") in app copy, so every OTHER tenant's public
  // page showed cabin names it does not have. The tile labels must be
  // derived from the tenant's own already-fetched `availability` list, not
  // baked into copy.
  it('renders one photo tile per the tenant’s own cabin, never another tenant’s hardcoded names', async () => {
    server.use(availabilityHandler(), contactHandler({}))

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await screen.findByText(cabinPhotoLabel('Casa Azul'))
    expect(screen.getByText(cabinPhotoLabel('Dos Aguas'))).toBeInTheDocument()
    // Exactly two tiles for two cabins -- no third tile invented to fill a
    // grid column, and no leftover hardcoded label from either fixture.
    expect(screen.queryByText('foto casa azul · interior')).not.toBeInTheDocument()
  })

  // The tenant's own cabin count sets the tile count; the grid's `lg:`
  // column count is a pure CSS decision, unrelated to how many tiles exist.
  it('renders exactly one tile for a tenant with a single cabin', async () => {
    server.use(
      http.get('http://localhost:8000/public/:slug/availability', () =>
        HttpResponse.json([{ property_id: CASA_AZUL_ID, name: 'Casa Azul', occupied: [] }]),
      ),
      contactHandler({}),
    )

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await screen.findByText(cabinPhotoLabel('Casa Azul'))
    expect(screen.queryByText(cabinPhotoLabel('Dos Aguas'))).not.toBeInTheDocument()
  })

  // A tenant with zero cabins must not show a "Las casas" heading above an
  // empty grid -- that reads as a broken page, not an honest empty state.
  it('hides the "Las casas" section entirely for a tenant with no cabins', async () => {
    server.use(
      http.get('http://localhost:8000/public/:slug/availability', () => HttpResponse.json([])),
      contactHandler({}),
    )

    const { AvailabilityPage } = await import('./AvailabilityPage')
    renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

    await screen.findByRole('group', { name: PUBLIC_COPY.filterLabel })
    expect(screen.queryByText(PUBLIC_COPY.housesTitle)).not.toBeInTheDocument()
  })

  // Screen 12 ("Calendario público · computadora"): the `lg:` breakpoint,
  // observed the same way `shared/viewport/useIsDesktop.ts` observes it in
  // production -- `window.matchMedia('(min-width: 1024px)')`. jsdom ships
  // no `matchMedia` at all, so every test above (none of which stub it)
  // keeps exercising the exact same mobile behaviour this file already
  // pinned before this desktop pass -- proven directly by the test just
  // above.
  describe('desktop (lg breakpoint)', () => {
    function mockDesktopViewport(): void {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          media: '(min-width: 1024px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      )
    }

    // Occupied nights the mobile fixtures above don't cover, in the SECOND
    // (October) displayed month -- proves the second panel is hydrated from
    // the real widened window, not rendered empty/wrong (the exact failure
    // mode the task brief calls out: "a public page lying about
    // availability").
    function desktopAvailabilityHandler(onRequest?: (url: URL) => void) {
      return http.get('http://localhost:8000/public/:slug/availability', ({ request }) => {
        const url = new URL(request.url)
        onRequest?.(url)
        return HttpResponse.json([
          {
            property_id: CASA_AZUL_ID,
            name: 'Casa Azul',
            occupied: [
              { check_in: '2026-09-10', check_out: '2026-09-12' },
              { check_in: '2026-10-05', check_out: '2026-10-08' },
            ],
          },
          { property_id: DOS_AGUAS_ID, name: 'Dos Aguas', occupied: [] },
        ])
      })
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('widens the fetch window to cover both displayed months in one request, and both render correctly', async () => {
      const requests: URL[] = []
      mockDesktopViewport()
      server.use(desktopAvailabilityHandler((url) => requests.push(url)), contactHandler({}))

      const { AvailabilityPage } = await import('./AvailabilityPage')
      renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

      await userEvent.click(await screen.findByRole('button', { name: 'Casa Azul' }))

      await waitFor(() => expect(requests).toHaveLength(1))
      expect(requests[0]?.searchParams.get('from')).toBe('2026-09-01')
      expect(requests[0]?.searchParams.get('to')).toBe('2026-11-01')

      await waitFor(() => expect(screen.getByTestId('day-2026-09-10').dataset.occupied).toBe('true'))
      expect(screen.getByTestId('day-2026-10-05').dataset.occupied).toBe('true')
    })

    it('"next" advances the two-month window by one month, and still sends exactly one request', async () => {
      const requests: URL[] = []
      mockDesktopViewport()
      server.use(desktopAvailabilityHandler((url) => requests.push(url)), contactHandler({}))

      const { AvailabilityPage } = await import('./AvailabilityPage')
      renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

      await waitFor(() => expect(requests).toHaveLength(1))

      await userEvent.click(screen.getByRole('button', { name: PUBLIC_COPY.nextMonth }))

      await waitFor(() => expect(requests).toHaveLength(2))
      expect(requests[1]?.searchParams.get('from')).toBe('2026-10-01')
      expect(requests[1]?.searchParams.get('to')).toBe('2026-12-01')
    })

    it('renders exactly one filter control (pills, not the segmented control too)', async () => {
      mockDesktopViewport()
      server.use(availabilityHandler(), contactHandler({}))

      const { AvailabilityPage } = await import('./AvailabilityPage')
      renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

      await screen.findByRole('group', { name: PUBLIC_COPY.filterLabel })
      expect(screen.getAllByRole('group', { name: PUBLIC_COPY.filterLabel })).toHaveLength(1)
      expect(screen.getAllByRole('button', { name: 'Casa Azul' })).toHaveLength(1)
    })

    it('renders the WhatsApp link exactly once (top-right variant, not the pinned-bottom one too)', async () => {
      mockDesktopViewport()
      server.use(availabilityHandler(), contactHandler({ 'mar-del-tuyu-cabins': '5491122334455' }))

      const { AvailabilityPage } = await import('./AvailabilityPage')
      renderAtSlug(AvailabilityPage, 'mar-del-tuyu-cabins')

      const link = await screen.findByRole('link', { name: PUBLIC_COPY.whatsappButton })
      expect(link).toHaveAttribute('href', 'https://wa.me/5491122334455')
      expect(screen.getAllByRole('link', { name: PUBLIC_COPY.whatsappButton })).toHaveLength(1)
    })
  })
})
