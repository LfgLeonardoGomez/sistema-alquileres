import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { ComponentType } from 'react'
import { Temporal } from 'temporal-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/setup'
import { HOME_COPY } from '../../shared/copy/home'
import { SESSION_COPY } from '../../shared/copy/session'
import { SHELL_COPY } from '../../shared/copy/shell'

// home-summary spec (screen 02, "deliberately empty"): one occupancy card,
// one always-reachable action, and structurally no revenue figure -- even
// though `GET /dashboard/summary` (back/app/schemas/dashboard.py) returns
// `collected` in the very same response. Rendered through a router (not a
// bare prop), the same `renderAtSlug`/`renderLoginAt` idiom every earlier
// screen's own test file established, since the primary action must prove
// it navigates via the router, not merely that a handler was called.

function renderHomeScreen(Component: ComponentType) {
  const router = createMemoryRouter(
    [
      { path: '/inicio', Component },
      // A stand-in for the wizard's first step (Phase 5, not built yet) --
      // just enough for this test to observe the URL actually changed.
      { path: '/reserva/nueva/:paso', Component: () => <p data-testid="wizard-step-stand-in" /> },
    ],
    { initialEntries: ['/inicio'] },
  )
  const view = render(<RouterProvider router={router} />)
  return { ...view, router }
}

function dashboardHandler(
  response: { collected: string; occupied_nights: number; available_nights: number },
  onRequest?: (url: URL) => void,
) {
  return http.get('http://localhost:8000/dashboard/summary', ({ request }) => {
    onRequest?.(new URL(request.url))
    return HttpResponse.json({ ...response, properties: [] })
  })
}

function mockTodayAt(instant: string) {
  return vi
    .spyOn(Temporal.Now, 'plainDateISO')
    .mockImplementation((timeZone) => Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone ?? 'UTC').toPlainDate())
}

describe('HomeScreen', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    vi.resetModules()
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    vi.restoreAllMocks()
  })

  // home-summary spec's "No Revenue Figure Is Ever Rendered": the API
  // response carries a nonzero `collected`, and NO element anywhere in the
  // rendered output may show `450000`, `$ 450.000`, or any other money
  // figure -- structural absence, not a hidden-but-mounted element (checked
  // via `container.innerHTML`, which covers attributes and comments too).
  it('renders no revenue figure at all, even though the API reports a nonzero collected amount', async () => {
    mockTodayAt('2026-09-15T12:00:00Z')
    server.use(dashboardHandler({ collected: '450000.00', occupied_nights: 18, available_nights: 42 }))

    const { HomeScreen } = await import('./HomeScreen')
    const { container } = renderHomeScreen(HomeScreen)

    await screen.findByText('18 de 60')

    expect(container.innerHTML).not.toMatch(/450000/)
    expect(container.innerHTML).not.toMatch(/\$\s?[\d.,]+/)
  })

  // [TRAP] home-summary spec's "Occupied-Nights Progress Reflects The
  // Argentina-Time Month" + "The Displayed Month Label Reflects The
  // Argentina-Time Month". At `2026-10-01T02:00:00Z` it is still
  // `2026-09-30T23:00` in Argentina -- a naive browser-local/UTC reading
  // would request and label October. The two fixtures below are
  // deliberately different (18/60 for September, 5/60 for a wrongly-computed
  // October) so a naive implementation fails on the NUMBERS, not only on
  // which query string happened to be sent.
  it('[TRAP] reflects the Argentina-time month near a UTC rollover, not the UTC month', async () => {
    mockTodayAt('2026-10-01T02:00:00Z')
    let requestedUrl: URL | undefined
    server.use(
      http.get('http://localhost:8000/dashboard/summary', ({ request }) => {
        const url = new URL(request.url)
        requestedUrl = url
        const isSeptemberWindow = url.searchParams.get('from') === '2026-09-01'
        return HttpResponse.json(
          isSeptemberWindow
            ? { collected: '0.00', occupied_nights: 18, available_nights: 42, properties: [] }
            : { collected: '0.00', occupied_nights: 5, available_nights: 55, properties: [] },
        )
      }),
    )

    const { HomeScreen } = await import('./HomeScreen')
    renderHomeScreen(HomeScreen)

    await screen.findByText('Septiembre')
    await screen.findByText('18 de 60')
    expect(requestedUrl?.searchParams.get('from')).toBe('2026-09-01')
    expect(requestedUrl?.searchParams.get('to')).toBe('2026-10-01')
  })

  // home-summary spec's "'Anotar Una Reserva' Is Always Reachable In One
  // Tap": present and navigable even with zero reservations recorded yet --
  // it MUST NOT be conditionally hidden behind an empty state.
  it('keeps "Anotar una reserva" present and reachable to wizard step 1 even with zero reservations', async () => {
    mockTodayAt('2026-09-15T12:00:00Z')
    server.use(dashboardHandler({ collected: '0.00', occupied_nights: 0, available_nights: 60 }))

    const { HomeScreen } = await import('./HomeScreen')
    const user = userEvent.setup()
    const { router } = renderHomeScreen(HomeScreen)

    const button = await screen.findByRole('link', { name: HOME_COPY.addReservation })
    await user.click(button)

    expect(router.state.location.pathname).toBe('/reserva/nueva/1')
  })

  // 10.35 [RED]: owner-session spec's "The Owner Can Sign Out From Inside
  // The App" -- Inicio renders the sign-out affordance, AND the two
  // things it must not disturb are still true in the SAME test: Note
  // C(i)'s one requirement actually at risk ("'Anotar Una Reserva' Is
  // Always Reachable In One Tap", asserted rather than assumed still
  // satisfied) and the tab bar still rendering exactly four links (the
  // fifth-tab alternative Note C(i) rejected, pinned here so a later hand
  // cannot quietly take it).
  it('renders the sign-out affordance without displacing "Anotar una reserva" or the four-item tab bar', async () => {
    mockTodayAt('2026-09-15T12:00:00Z')
    server.use(dashboardHandler({ collected: '0.00', occupied_nights: 0, available_nights: 60 }))

    const { HomeScreen } = await import('./HomeScreen')
    renderHomeScreen(HomeScreen)

    expect(await screen.findByRole('button', { name: SESSION_COPY.signOut })).toBeInTheDocument()

    const addReservationLink = screen.getByRole('link', { name: HOME_COPY.addReservation })
    expect(addReservationLink).toHaveAttribute('href', '/reserva/nueva/1')

    const tabBar = screen.getByRole('navigation', { name: SHELL_COPY.tabBarLabel })
    expect(within(tabBar).getAllByRole('link')).toHaveLength(4)
  })
})
