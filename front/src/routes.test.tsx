import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from './test/setup'
import { queryClient } from './shared/mutation/queryClient'
import { SESSION_COPY } from './shared/copy/session'
import { ROUTING_COPY } from './shared/copy/routing'
import { SHELL_COPY } from './shared/copy/shell'

// design D31 + the Phase 2 addendum (gap 1): "one explicit routes.tsx",
// both trees visibly separate, public tree lazy(). This is the module that
// wires `/disponibilidad/:slug` to `AvailabilityPage` -- until this task,
// nothing built the router at all, even though task 3.14 already depends
// on `router.navigate` existing.
//
// The assertion strategy: the availability fetch itself carries the slug
// in its path (`GET /public/{slug}/availability`), so capturing the
// requested URL is a direct, non-tautological proof that the slug reached
// the page from the URL, not from a hardcoded default.

function availabilityHandler(onRequest: (slug: string) => void) {
  return http.get('http://localhost:8000/public/:slug/availability', ({ params }) => {
    onRequest(params.slug as string)
    return HttpResponse.json([])
  })
}

function contactHandler() {
  return http.get('http://localhost:8000/public/:slug/contact', () =>
    HttpResponse.json({ name: 'Tenant', whatsapp: null }),
  )
}

describe('routes', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    // `queryClient` is the one shared application-wide singleton (D30) --
    // this file's own tests dynamically re-import `./routes` without
    // `vi.resetModules()` (the module graph, and this singleton with it,
    // persists across every `it()` below), so its cache is cleared between
    // tests here the same way `resetHandlers()`/`localStorage.clear()`
    // already isolate MSW and session state per test.
    queryClient.clear()
  })

  it('mounts the availability page with the slug taken from the URL', async () => {
    const requestedSlugs: string[] = []
    server.use(availabilityHandler((slug) => requestedSlugs.push(slug)), contactHandler())

    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/disponibilidad/casa-aya'] })
    render(<RouterProvider router={router} />)

    await waitFor(() => expect(requestedSlugs).toHaveLength(1))
    expect(requestedSlugs[0]).toBe('casa-aya')
  })

  it('reaches the page as a different slug when the URL carries a different slug', async () => {
    const requestedSlugs: string[] = []
    server.use(availabilityHandler((slug) => requestedSlugs.push(slug)), contactHandler())

    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, {
      initialEntries: ['/disponibilidad/mar-del-tuyu-cabins'],
    })
    render(<RouterProvider router={router} />)

    await waitFor(() => expect(requestedSlugs).toHaveLength(1))
    expect(requestedSlugs[0]).toBe('mar-del-tuyu-cabins')
  })

  // [TEST] task 2.35, route configuration rather than a behaviour with its
  // own red phase: 2.32's GREEN already landed the catch-all route as part
  // of building a usable router, so this confirms that configuration
  // rather than introducing new production code. Distinct from D37's
  // SPA-hosting requirement (recorded in the observation below), which is
  // a deployment concern this in-memory router cannot exercise: a hard
  // load of an unknown path is a hosting decision, not client-side routing.
  it('renders the app’s own not-found surface for a path with no matching route', async () => {
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/esto-no-existe'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('No encontramos esa página.')).toBeInTheDocument()
  })

  // owner-session spec's "An Expired Or Invalid Token Clears The Session And
  // Returns To Ingresar" depends on `/login` actually resolving to the
  // sign-in screen -- `client.ts`'s 401 branch (task 3.14) already calls
  // `router.navigate('/login')`, but until this route exists in
  // `appRoutes`, that call falls through to the catch-all and lands the
  // owner on the not-found surface instead. Asserting on the not-found
  // text's ABSENCE, not just the sign-in screen's presence, is the point:
  // it is what proves the fall-through no longer happens.
  it('mounts the login screen at /login, not the not-found screen', async () => {
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/login'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
    expect(screen.queryByText(ROUTING_COPY.notFound)).not.toBeInTheDocument()
  })

  // Task 3.23's "never a dead link" -- every one of `TabBar`'s four
  // destinations must resolve to real, mounted content, not the catch-all
  // `NotFoundScreen` `/login` itself fell through to before 3.14 wired it
  // (see that test's own note above for the exact same failure mode this
  // guards against for the other four routes).
  it('mounts a real screen -- never the not-found catch-all -- at /inicio, /calendario, /huespedes, and /cabanas', async () => {
    server.use(
      http.get('http://localhost:8000/dashboard/summary', () =>
        HttpResponse.json({ collected: '0.00', occupied_nights: 0, available_nights: 0, properties: [] }),
      ),
      // task 4.14: /calendario now mounts the real CalendarScreen, which
      // fetches cabins, clients and the selected cabin's reservations via
      // real `useQuery` hooks -- these three handlers are what makes this
      // smoke test still exercise a real, data-driven screen rather than
      // the retired placeholder.
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([{ id: 'cab-1', name: 'Casa Azul', is_active: true }]),
      ),
      http.get('http://localhost:8000/clients', () => HttpResponse.json([])),
      http.get('http://localhost:8000/reservations', () => HttpResponse.json([])),
    )
    const { routeConfig } = await import('./routes')

    for (const path of ['/inicio', '/calendario', '/huespedes', '/cabanas']) {
      const router = createMemoryRouter(routeConfig, { initialEntries: [path] })
      const { unmount } = render(<RouterProvider router={router} />)

      expect(await screen.findByRole('navigation', { name: SHELL_COPY.tabBarLabel })).toBeInTheDocument()
      expect(screen.queryByText(ROUTING_COPY.notFound)).not.toBeInTheDocument()

      unmount()
    }
  })

  // The defect this run's own brief names directly: `main.tsx` mounted
  // `<RouterProvider>` with no `<QueryClientProvider>` anywhere above it in
  // the real app tree, even though `shared/mutation/queryClient.ts` has
  // existed since Phase 1 (1.26/1.27) and its retry policy is tested
  // (D30). Every screen built before 4.14 happened to avoid `useQuery`
  // inside a mounted component (`HomeScreen.tsx` uses a bare `useEffect` +
  // `apiRequest`), so nothing exercised the gap -- `CalendarScreen` (via
  // `useCabins`/`useClients`/`useReservationsForCabin`) is the first real
  // screen that does, and it would throw "No QueryClient set" the instant
  // it mounted through the REAL router with no provider of its own.
  //
  // This test supplies NO local `QueryClientProvider` -- it builds the
  // router from the app's own `routeConfig`, the exact way `main.tsx` does
  // and the exact way every other test in this file already does, which is
  // the point: a test that wrapped its own provider here would recreate
  // the blind spot that let the gap survive four phases.
  it('renders the calendar screen’s real data when mounted through the real router, with no locally-supplied QueryClientProvider', async () => {
    server.use(
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([{ id: 'cab-1', name: 'Casa Azul', is_active: true }]),
      ),
      http.get('http://localhost:8000/clients', () =>
        HttpResponse.json([{ id: 'cli-1', full_name: 'Ana Owner', phone: '111', email: null, national_id: null, is_active: true }]),
      ),
      http.get('http://localhost:8000/reservations', () =>
        HttpResponse.json([
          {
            id: 'res-1',
            client_id: 'cli-1',
            check_in: '2026-09-03',
            check_out: '2026-09-07',
            status: 'confirmed',
            balance: '0.00',
          },
        ]),
      ),
    )
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/calendario?cabana=cab-1&mes=2026-09'] })

    render(<RouterProvider router={router} />)

    // If the provider gap were still present, `useCabins`/`useClients`/
    // `useReservationsForCabin` would throw synchronously on mount ("No
    // QueryClient set") and this text would never appear -- it would
    // either time out or the test would fail with the thrown error itself.
    expect(await screen.findByText('Pagado', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(ROUTING_COPY.notFound)).not.toBeInTheDocument()
  })
})
