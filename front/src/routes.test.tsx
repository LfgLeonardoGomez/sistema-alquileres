import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from './test/setup'
import { queryClient } from './shared/mutation/queryClient'
import { SESSION_COPY } from './shared/copy/session'
import { ROUTING_COPY } from './shared/copy/routing'
import { SHELL_COPY } from './shared/copy/shell'
import { HOME_COPY } from './shared/copy/home'
import { PUBLIC_COPY } from './shared/copy/public'

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

  afterEach(async () => {
    Object.assign(import.meta.env, originalEnv)
    // `queryClient` is the one shared application-wide singleton (D30) --
    // this file's own tests dynamically re-import `./routes` without
    // `vi.resetModules()` (the module graph, and this singleton with it,
    // persists across every `it()` below), so its cache is cleared between
    // tests here the same way `resetHandlers()`/`localStorage.clear()`
    // already isolate MSW and session state per test.
    queryClient.clear()
    // `useSessionStore` is the SAME kind of shared singleton (D30) -- task
    // 10.13-10.19's own tests set a session per-test with `setToken`, and
    // this undoes it so an authenticated state never leaks into the next
    // `it()`, matching `client.test.tsx`'s own `clearToken()` discipline.
    // Dynamically imported, not statically, for the same reason every
    // other module here is: `store.ts` transitively reads `env.ts` at
    // module load, which must happen after `beforeEach` sets those vars.
    const { useSessionStore } = await import('./app/session/store')
    useSessionStore.getState().clearToken()
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
    // 10.14's guard now wraps every one of these four routes -- a session
    // is required for this test to still exercise the real screens rather
    // than being redirected to /login, exactly as 10.15's own table-driven
    // test proves for the unauthenticated case.
    const { useSessionStore } = await import('./app/session/store')
    useSessionStore.getState().setToken('a-valid-looking-token')
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
    // 10.14's guard now wraps /calendario -- see the note above.
    const { useSessionStore } = await import('./app/session/store')
    useSessionStore.getState().setToken('a-valid-looking-token')
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

  // Task 6.15's own "never a dead link" check, following 3.23's precedent
  // exactly. `/reserva/:id` has been a forward reference in this file since
  // 3.22 (D31's routing table lists it; nothing before Phase 6 built the
  // screen). Phase 6 builds it -- and an unwired detail screen would be the
  // same "built, verified, never wired" defect this module's own comment
  // already records three times (the queryClient provider, the import
  // resolver, `/login`). It is also a hard prerequisite for 6.30/6.31,
  // where `/reserva/:id/editar` must REDIRECT to this route.
  it('mounts the reservation detail -- never the not-found catch-all -- at /reserva/:id', async () => {
    // 10.14's guard now wraps /reserva/:id -- see the note above.
    const { useSessionStore } = await import('./app/session/store')
    useSessionStore.getState().setToken('a-valid-looking-token')
    const RESERVATION = 'd1111111-1111-1111-1111-111111111111'
    server.use(
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([{ id: 'cab-1', name: 'Casa Azul', is_active: true }]),
      ),
      http.get('http://localhost:8000/clients', () =>
        HttpResponse.json([
          { id: 'guest-1', full_name: 'Marta González', phone: '11 2233 4455', email: null, national_id: null, is_active: true },
        ]),
      ),
      http.get(`http://localhost:8000/reservations/${RESERVATION}`, () =>
        HttpResponse.json({
          id: RESERVATION,
          property_id: 'cab-1',
          client_id: 'guest-1',
          check_in: '2026-09-03',
          check_out: '2026-09-07',
          status: 'confirmed',
          price_per_night: null,
          price_total: '180000.00',
          paid_amount: '100000.00',
          created_at: '2026-08-01T00:00:00Z',
          effective_total: '180000.00',
          balance: '80000.00',
          is_completed: false,
        }),
      ),
      http.get(`http://localhost:8000/reservations/${RESERVATION}/payments`, () => HttpResponse.json([])),
    )
    const { routeConfig } = await import('./routes')

    const router = createMemoryRouter(routeConfig, { initialEntries: [`/reserva/${RESERVATION}`] })
    render(<RouterProvider router={router} />)

    // Real, data-driven content from the real query layer -- not merely
    // "something rendered".
    expect(await screen.findByRole('heading', { name: 'Marta González' })).toBeInTheDocument()
    expect(screen.getByText('Le falta pagar')).toBeInTheDocument()
    expect(screen.queryByText(ROUTING_COPY.notFound)).not.toBeInTheDocument()
  })

  // owner-session spec's "An Unauthenticated Visitor Never Renders An
  // Authenticated Screen". 10.13 [RED]: with no session held, requesting
  // /inicio directly ends on /login and renders no Inicio content at any
  // point -- asserted against HOME_COPY/SESSION_COPY's own distinctive
  // strings, matching this file's existing pattern of asserting against
  // copy rather than a component name.
  it('sends an unauthenticated visitor to /login and never renders /inicio', async () => {
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/inicio'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
    expect(screen.queryByText(HOME_COPY.greeting)).not.toBeInTheDocument()
  })

  // 10.15 [TRIANGULATE]: table-driven over every authenticated path, plus
  // the opposite input -- a held session reaching /inicio and rendering it,
  // proving the guard is a GATE, not a wall that always redirects.
  it.each([
    ['/calendario'],
    ['/huespedes'],
    ['/cabanas'],
    ['/reserva/nueva/1'],
    ['/reserva/res-1'],
    ['/reserva/res-1/editar'],
  ])('sends an unauthenticated visitor to /login from %s, with none of that screen rendered', async (path) => {
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: [path] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
    expect(screen.queryByText(ROUTING_COPY.notFound)).not.toBeInTheDocument()
  })

  it('lets a held session reach /inicio and render it -- the guard is a gate, not a wall', async () => {
    const { useSessionStore } = await import('./app/session/store')
    useSessionStore.getState().setToken('a-valid-looking-token')
    server.use(
      http.get('http://localhost:8000/dashboard/summary', () =>
        HttpResponse.json({ collected: '0.00', occupied_nights: 0, available_nights: 0, properties: [] }),
      ),
    )
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/inicio'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(HOME_COPY.greeting)).toBeInTheDocument()
    expect(screen.queryByLabelText(SESSION_COPY.emailLabel)).not.toBeInTheDocument()
  })

  // 10.16 [RED][TRAP]: the guard's blast radius is bounded -- the public
  // availability page and the not-found screen are NEVER guarded (D31:
  // "none, ever"). Prove teeth (8.7's precedent) is done at 10.17's own
  // implementation step, by temporarily extending the pathless guard to
  // wrap `publicRoutes` and the catch-all too and confirming both cases
  // below fail red -- see this task's Observed note in `tasks.md` for that
  // probe and its restore.
  it('never guards the public availability page, even with no session held', async () => {
    server.use(
      http.get('http://localhost:8000/public/:slug/availability', () => HttpResponse.json([])),
      http.get('http://localhost:8000/public/:slug/contact', () =>
        HttpResponse.json({ name: 'Tenant', whatsapp: null }),
      ),
    )
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/disponibilidad/casa-aya'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(PUBLIC_COPY.legendFree)).toBeInTheDocument()
    expect(screen.queryByLabelText(SESSION_COPY.emailLabel)).not.toBeInTheDocument()
  })

  it('never guards the not-found screen, even with no session held', async () => {
    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/esto-no-existe'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(ROUTING_COPY.notFound)).toBeInTheDocument()
    expect(screen.queryByLabelText(SESSION_COPY.emailLabel)).not.toBeInTheDocument()
  })

  // owner-session spec's "The attempted path survives the round trip".
  // 10.18 [RED] / 10.19 [GREEN]: the blocked request's own path survives
  // being sent to /login and back. The wizard draft is seeded with a cabin
  // and dates before rendering -- Wizard.tsx's own step-3 prerequisite
  // guard (5.x, unrelated to this task) would otherwise bounce a bare
  // `/reserva/nueva/3` straight to step 1 the instant it mounted, which
  // would make this test's own assertion meaningless; seeding it matches
  // the real shape of reaching step 3 at all (she has always chosen a
  // cabin and dates first, the same framing 5.30/10.22 use).
  it('returns her to the path she originally requested after she signs in', async () => {
    server.use(
      http.post('http://localhost:8000/auth/login', () =>
        HttpResponse.json({ access_token: 'a.b.c', token_type: 'bearer' }),
      ),
    )
    const { useWizardDraftStore } = await import('./app/reservations/wizard/store')
    useWizardDraftStore.getState().setCabin({ id: 'cab-1', name: 'Casa Azul' })
    useWizardDraftStore.getState().setDates({ checkIn: '2026-09-08' as never, checkOut: '2026-09-12' as never })

    const { routeConfig } = await import('./routes')
    const router = createMemoryRouter(routeConfig, { initialEntries: ['/reserva/nueva/3'] })
    render(<RouterProvider router={router} />)

    await screen.findByLabelText(SESSION_COPY.emailLabel)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
    await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'correct-password-123')
    await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/reserva/nueva/3'))
    // The router's location commits BEFORE React re-renders, and `/reserva/nueva/3`
    // is a `lazy()` route whose chunk still has to load — so a synchronous check
    // here races the unmount and passes only when the machine is fast enough.
    // Same false-negative shape 10.16's own first draft had. Await the absence.
    await waitFor(() =>
      expect(screen.queryByLabelText(SESSION_COPY.emailLabel)).not.toBeInTheDocument(),
    )

    useWizardDraftStore.getState().reset()
  })
})
