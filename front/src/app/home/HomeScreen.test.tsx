import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import { TENANT_SETTINGS_COPY } from '../../shared/copy/tenant'

// home-summary spec (screen 02): one always-reachable action, and,
// following the owner's live-review decision (2026-09-07), one "Próximas
// llegadas" card (`UpcomingArrivals.tsx`) in place of the original
// occupancy card -- structurally no revenue figure either way, even though
// the reservation data `UpcomingArrivals` reads from (`useReservations()`)
// carries real price/paid figures in the very same records. Rendered
// through a router (not a bare prop), the same `renderAtSlug`/
// `renderLoginAt` idiom every earlier screen's own test file established,
// since the primary action must prove it navigates via the router, not
// merely that a handler was called.

// `UpcomingArrivals` (replacing the occupancy card, 2026-09-07) reads
// through `useCabins()`/`useClients()`/`useReservations()` -- all
// TanStack Query hooks -- so this screen now needs a `QueryClientProvider`
// in its render tree, the same `CabinDirectory.test.tsx`/
// `GuestDirectory.test.tsx` own precedent for any screen composing those
// hooks. `retry: false` keeps a genuinely-unmocked endpoint's error
// surfacing immediately rather than retried into the test's own timeout.
function renderHomeScreen(Component: ComponentType) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/inicio', Component },
      // A stand-in for the wizard's first step (Phase 5, not built yet) --
      // just enough for this test to observe the URL actually changed.
      { path: '/reserva/nueva/:paso', Component: () => <p data-testid="wizard-step-stand-in" /> },
    ],
    { initialEntries: ['/inicio'] },
  )
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
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

// `UpcomingArrivals` (via `useUpcomingArrivals`) reuses `useCabins()`/
// `useClients()`/`useReservations()` verbatim -- these three fixtures are
// this file's own instance of the same "mock every endpoint the screen
// actually fetches" convention `CabinDirectory.test.tsx`/
// `GuestDirectory.test.tsx` already established for those hooks.
type CabinFixture = { id: string; name: string; is_active: boolean }
type ClientFixture = { id: string; full_name: string; phone: string; email: string | null; national_id: string | null; is_active: boolean }
type ReservationFixture = Record<string, unknown>

function cabinsHandler(cabins: readonly CabinFixture[]) {
  return http.get('http://localhost:8000/properties', () => HttpResponse.json(cabins))
}

function clientsHandler(clients: readonly ClientFixture[]) {
  return http.get('http://localhost:8000/clients', () => HttpResponse.json(clients))
}

function reservationsHandler(reservations: readonly ReservationFixture[]) {
  return http.get('http://localhost:8000/reservations', () => HttpResponse.json(reservations))
}

// Part A of this run's brief: the tenant settings sheet's own `GET /tenant`
// (`app/tenant/useTenant.ts`), mocked here the same way every other
// `HomeScreen`-fetched endpoint in this file already is.
type TenantFixture = { id: string; slug: string; name: string; whatsapp: string | null }

function tenantHandler(tenant: TenantFixture) {
  return http.get('http://localhost:8000/tenant', () => HttpResponse.json(tenant))
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

  // home-summary spec's "No Revenue Figure Is Ever Rendered". Re-anchored
  // (2026-09-07) on the "Próximas llegadas" card that replaced the
  // occupancy card: the reservation this fixture supplies carries a
  // nonzero `price_total`/`paid_amount`, flowing through the exact same
  // `useReservations()` call `UpcomingArrivals` reuses to find each
  // cabin's next arrival -- and still, NO element anywhere in the rendered
  // output may show `450000`, `$ 450.000`, or any other money figure --
  // structural absence, not a hidden-but-mounted element (checked via
  // `container.innerHTML`, which covers attributes and comments too).
  it('renders no revenue figure at all, even though a reservation carries a nonzero price', async () => {
    mockTodayAt('2026-09-15T12:00:00Z')
    server.use(
      cabinsHandler([{ id: 'cab-1111-1111-1111-111111111111', name: 'Casa Azul', is_active: true }]),
      clientsHandler([{ id: 'cli-1111-1111-1111-111111111111', full_name: 'Marta Ruiz', phone: '1122334455', email: null, national_id: null, is_active: true }]),
      reservationsHandler([
        {
          id: 'res-1111-1111-1111-111111111111',
          property_id: 'cab-1111-1111-1111-111111111111',
          client_id: 'cli-1111-1111-1111-111111111111',
          check_in: '2026-09-16',
          check_out: '2026-09-20',
          status: 'confirmed',
          price_per_night: null,
          price_total: '450000.00',
          paid_amount: '450000.00',
          effective_total: '450000.00',
          balance: '0.00',
        },
      ]),
    )

    const { HomeScreen } = await import('./HomeScreen')
    const { container } = renderHomeScreen(HomeScreen)

    await screen.findByText('Casa Azul')

    expect(container.innerHTML).not.toMatch(/450000/)
    expect(container.innerHTML).not.toMatch(/\$\s?[\d.,]+/)
  })

  // [TRAP] home-summary spec's "The Displayed Month Label Reflects The
  // Argentina-Time Month". At `2026-10-01T02:00:00Z` it is still
  // `2026-09-30T23:00` in Argentina -- a naive browser-local/UTC reading
  // would label October instead.
  //
  // The sibling requirement this test used to also cover, "Occupied-Nights
  // Progress Reflects The Argentina-Time Month", was superseded by the
  // owner's 2026-09-07 decision to replace the occupancy card with
  // `UpcomingArrivals` (recorded in `openspec/changes/cabin-booking-
  // frontend/specs/home-summary/spec.md`). The underlying claim -- that a
  // `/dashboard/summary` window is computed in Argentina time, not UTC --
  // did not stop being true, it moved: `CabinDirectory` still calls
  // `useDashboardSummary()` for its own occupied-nights-this-month figure,
  // so this trap now lives there instead (`CabinDirectory.test.tsx`).
  it('[TRAP] reflects the Argentina-time month near a UTC rollover, not the UTC month', async () => {
    mockTodayAt('2026-10-01T02:00:00Z')
    server.use(cabinsHandler([]), clientsHandler([]), reservationsHandler([]))

    const { HomeScreen } = await import('./HomeScreen')
    renderHomeScreen(HomeScreen)

    await screen.findByText('Septiembre')
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
  //
  // Extended (this run's brief, Part A) for the "Ajustes" settings-sheet
  // trigger placed BESIDE sign-out (`HomeScreen.tsx:77`'s own precedent,
  // per this run's instructions) -- composed into the SAME row, never a
  // fifth tab and never adding height to this screen's carefully budgeted
  // `gap-4` column (`HomeScreen.tsx`'s own comment on that budget), so the
  // two "must not disturb" assertions below double as this addition's own
  // geometry proof, not merely eyeballed.
  it('renders the sign-out affordance without displacing "Anotar una reserva" or the four-item tab bar', async () => {
    mockTodayAt('2026-09-15T12:00:00Z')
    server.use(dashboardHandler({ collected: '0.00', occupied_nights: 0, available_nights: 60 }))

    const { HomeScreen } = await import('./HomeScreen')
    renderHomeScreen(HomeScreen)

    expect(await screen.findByRole('button', { name: SESSION_COPY.signOut })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: TENANT_SETTINGS_COPY.openSettings })).toBeInTheDocument()

    const addReservationLink = screen.getByRole('link', { name: HOME_COPY.addReservation })
    expect(addReservationLink).toHaveAttribute('href', '/reserva/nueva/1')

    const tabBar = screen.getByRole('navigation', { name: SHELL_COPY.tabBarLabel })
    expect(within(tabBar).getAllByRole('link')).toHaveLength(4)
  })

  // Part A of this run's brief: tapping "Ajustes" opens the settings
  // BOTTOM SHEET (never a screen/route -- `router.state.location.pathname`
  // stays `/inicio`), showing the business name read-only and the current
  // WhatsApp number -- the first frontend consumer of `GET /tenant`
  // reached from Home.
  it('opens the tenant settings sheet from "Ajustes", showing the business name and current WhatsApp number, without navigating away from /inicio', async () => {
    mockTodayAt('2026-09-15T12:00:00Z')
    server.use(
      dashboardHandler({ collected: '0.00', occupied_nights: 0, available_nights: 60 }),
      tenantHandler({ id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: '5492612094262' }),
    )

    const { HomeScreen } = await import('./HomeScreen')
    const user = userEvent.setup()
    const { router } = renderHomeScreen(HomeScreen)

    await user.click(await screen.findByRole('button', { name: TENANT_SETTINGS_COPY.openSettings }))

    expect(await screen.findByText('Alquileres AyA')).toBeInTheDocument()
    expect(screen.getByLabelText(TENANT_SETTINGS_COPY.whatsappLabel)).toHaveValue('5492612094262')
    expect(router.state.location.pathname).toBe('/inicio')

    await user.click(screen.getByRole('button', { name: TENANT_SETTINGS_COPY.close }))
    expect(screen.queryByRole('dialog', { name: TENANT_SETTINGS_COPY.title })).not.toBeInTheDocument()
  })
})
