import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COPY } from '../../shared/copy/session'
import { NETWORK_FAILURE_STATUS } from '../../shared/errors/normalise'
import { server } from '../../test/setup'

// design D32: `fetch` rejects with an indistinguishable TypeError for a
// dropped connection and a CORS rejection. `client.ts` is the app's one
// network call site (1.25); it must never leak a raw exception to caller
// code -- every failure is routed through 1.19's `normalise()` into a
// structured `ApiError` (1.17: no `detail` field, structurally).
//
// `router` (from `../../routes`) and `useSessionStore` (from
// `../session/store`) are dynamically imported inside each test, never
// statically at the top of this file -- both transitively import `env.ts`,
// which reads `import.meta.env` at module load (0.7/1.23's own discipline);
// a static top-level import here evaluates before `beforeEach` sets those
// variables and throws `env.ts`'s own "missing variable" error.

describe('apiRequest', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('normalises a network failure with no response body into a structured ApiError, never an unhandled rejection', async () => {
    server.use(http.get('http://localhost:8000/reservations', () => HttpResponse.error()))

    const { apiRequest } = await import('./client')

    await expect(apiRequest('/reservations')).rejects.toEqual({
      status: NETWORK_FAILURE_STATUS,
      code: null,
    })
  })

  // Triangulates against a different failure shape entirely: a real,
  // shaped `{detail, code}` response, proving the same call site routes
  // both through 1.19's `normalise()` rather than special-casing the
  // network branch.
  it('normalises a shaped 409 response into a structured ApiError, discarding detail', async () => {
    server.use(
      http.post('http://localhost:8000/reservations', () =>
        HttpResponse.json({ detail: 'Dates are not available', code: 'dates_unavailable' }, { status: 409 }),
      ),
    )

    const { apiRequest } = await import('./client')

    await expect(apiRequest('/reservations', { method: 'POST' })).rejects.toEqual({
      status: 409,
      code: 'dates_unavailable',
    })
  })

  it('resolves with the decoded JSON body on a successful request, built against the same env.ts base URL', async () => {
    server.use(
      http.get('http://localhost:8000/dashboard/summary', () =>
        HttpResponse.json({ occupied_nights: 18, capacity_nights: 60 }),
      ),
    )

    const { apiRequest } = await import('./client')

    await expect(apiRequest('/dashboard/summary')).resolves.toEqual({
      occupied_nights: 18,
      capacity_nights: 60,
    })
  })

  // D31 point 1: "app/api/client.ts is the only module that reads the
  // token and sets an Authorization header." Not itself named as a
  // separate RED/GREEN pair by tasks 3.2-3.14's text, but D31 states it as
  // a binding architectural requirement and this module's own prior
  // comment ("no bearer-header attachment yet -- the session store this
  // depends on does not exist until Phase 3") named it as this phase's own
  // deferred work -- see 3.14's Observed note for the full account of why
  // this is tested here rather than left unimplemented or implemented
  // untested.
  describe('bearer header attachment', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('attaches Authorization: Bearer <token> when a token is present', async () => {
      let capturedAuthHeader: string | null = null
      server.use(
        http.get('http://localhost:8000/dashboard/summary', ({ request }) => {
          capturedAuthHeader = request.headers.get('Authorization')
          return HttpResponse.json({ occupied_nights: 1, capacity_nights: 1 })
        }),
      )
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')

      const { apiRequest } = await import('./client')
      await apiRequest('/dashboard/summary')

      expect(capturedAuthHeader).toBe('Bearer a-valid-looking-token')
      useSessionStore.getState().clearToken()
    })

    // Triangulates against the absence case: no token in the store means
    // no header at all, not an `Authorization: Bearer null` string.
    it('sends no Authorization header when no token is present', async () => {
      let capturedAuthHeader: string | null = 'not-yet-observed'
      server.use(
        http.get('http://localhost:8000/dashboard/summary', ({ request }) => {
          capturedAuthHeader = request.headers.get('Authorization')
          return HttpResponse.json({ occupied_nights: 1, capacity_nights: 1 })
        }),
      )
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().clearToken()

      const { apiRequest } = await import('./client')
      await apiRequest('/dashboard/summary')

      expect(capturedAuthHeader).toBeNull()
    })
  })

  // owner-session spec's "An Expired Or Invalid Token Clears The Session
  // And Returns To Ingresar" -- the REACTIVE half (D29(b)): any 401, from
  // any request, anywhere, hits this ONE interceptor. `router.navigate`
  // is spied and stubbed to a no-op -- this is a unit test of the
  // interceptor's own two actions (clear the token, call the router's own
  // method), not an integration test of what `/login` then renders.
  describe('the 401 interceptor', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('clears the stored token and navigates to /login via the router, never window.location', async () => {
      server.use(
        http.get('http://localhost:8000/reservations', () =>
          HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')
      // A known, deterministic starting location -- 10.21's own extension
      // of this exact call (Note B) reads `router.state.location`, so a
      // real (unmocked) navigate first is what makes the assertion below
      // deterministic rather than dependent on wherever a PRIOR test in
      // this file happened to leave the shared `router` singleton.
      await router.navigate('/inicio')
      const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve())

      const { apiRequest } = await import('./client')

      await expect(apiRequest('/reservations')).rejects.toEqual({ status: 401, code: null })
      expect(useSessionStore.getState().token).toBeNull()
      // Task 3.16 adds a `state.expired` flag to this same call (D29(c));
      // task 10.21 (Note B, approved) adds `state.from` -- updated here
      // rather than left to silently start failing, since both are real
      // behavioural changes to the interceptor's own call shape, not a
      // rename.
      expect(navigateSpy).toHaveBeenCalledWith('/login', { state: { expired: true, from: '/inicio' } })

      useSessionStore.getState().clearToken()
    })

    // owner-session spec's "The attempted path survives the round trip",
    // Note B (approved 10.1(b)): 10.20 [RED] / 10.21 [GREEN]. A 401 fired
    // while she is on a guarded path now carries BOTH fields --
    // `state.expired` unchanged (3.15/3.16) and `state.from` set to the
    // path she was actually on. Read from the router's own current
    // location, never `window.location` (D29's own binding constraint) --
    // moved there with a real (unmocked) `router.navigate` first, then the
    // spy is installed only for the call this test actually asserts on.
    it('carries both expired and the current path on a 401 fired from a guarded path', async () => {
      server.use(
        http.get('http://localhost:8000/reservations', () =>
          HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')
      await router.navigate('/reserva/42')

      const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve())

      const { apiRequest } = await import('./client')
      await expect(apiRequest('/reservations')).rejects.toEqual({ status: 401, code: null })

      expect(navigateSpy).toHaveBeenCalledWith('/login', { state: { expired: true, from: '/reserva/42' } })

      useSessionStore.getState().clearToken()
    })

    it('does not silently re-authenticate on a reload after a 401 clears the token', async () => {
      server.use(
        http.get('http://localhost:8000/reservations', () =>
          HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')
      vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve())

      const { apiRequest } = await import('./client')
      await expect(apiRequest('/reservations')).rejects.toEqual({ status: 401, code: null })

      // "A reload afterward" -- a fresh module load of the store, the same
      // dynamic-import discipline the store's own tests use, standing in
      // for reopening the app. `localStorage` (real, not mocked) is what
      // actually carries the cleared state across this reload.
      vi.resetModules()
      const { useSessionStore: reloadedSessionStore } = await import('../session/store')
      expect(reloadedSessionStore.getState().isAuthenticated).toBe(false)
    })

    // The two tests above spy `router.navigate` to a no-op and assert only
    // that it was CALLED with `/login` -- proof the interceptor tried, not
    // proof the owner actually ends up looking at the sign-in screen.
    // `routes.tsx`'s `appRoutes` was empty until this task, so that call
    // was landing on the catch-all not-found screen in production despite
    // every test above being green. This test uses the REAL router (no
    // spy, no mock) and renders it, so a real 401 must produce a real,
    // visible sign-in screen -- the actual owner-session spec requirement,
    // not an interceptor implementation detail.
    it('a real 401 through the real router lands the owner on the sign-in screen, not just a spied navigate call', async () => {
      server.use(
        http.get('http://localhost:8000/reservations', () =>
          HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')

      render(<RouterProvider router={router} />)

      const { apiRequest } = await import('./client')
      await expect(apiRequest('/reservations')).rejects.toEqual({ status: 401, code: null })

      expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
      expect(useSessionStore.getState().token).toBeNull()

      useSessionStore.getState().clearToken()
    })

    // Task 3.15/3.16, D29(c) (approved 2026-09-05): the approved re-entry
    // copy renders above the login form specifically on a 401-triggered
    // redirect, not merely "somewhere in the login screen at all times" --
    // the router.navigate call carries a `state.expired` flag for
    // `LoginScreen` to read, since a plain visit to `/login` has no such
    // state (see `Login.test.tsx`'s own triangulation for that negative
    // case).
    it('shows the approved re-entry message above the login form after a 401 redirect, with no technical wording', async () => {
      server.use(
        http.get('http://localhost:8000/reservations', () =>
          HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      // A known starting location, NOT /login -- this file's own tests
      // share one `router` singleton (no `vi.resetModules()` between every
      // `it()`), and the previous test in this describe block leaves it
      // sitting AT /login after its own real 401 redirect. Task 10.11's
      // new guard (owner-session spec's "An Authenticated Visitor Is Not
      // Shown The Sign-In Screen") means mounting `/login` while already
      // authenticated now redirects to /inicio BEFORE the 401 below ever
      // fires -- exactly correct behaviour, but not what this test means
      // to exercise, which is the INTERCEPTOR's own redirect, not this
      // one. An unmatched path (the catch-all, no fetches of its own,
      // unlike a real authenticated screen) sidesteps that cleanly.
      useSessionStore.getState().setToken('a-valid-looking-token')
      await router.navigate('/un-lugar-neutral-para-este-test')

      render(<RouterProvider router={router} />)

      const { apiRequest } = await import('./client')
      await expect(apiRequest('/reservations')).rejects.toEqual({ status: 401, code: null })

      const message = await screen.findByText(SESSION_COPY.expiredMessage)
      expect(message).toBeInTheDocument()
      expect(message.textContent).not.toMatch(/token|sesión|expiró/i)

      useSessionStore.getState().clearToken()
    })
  })

  // Note D fix, owner-approved 2026-09-07 ("si dale"): `POST /auth/login`
  // returning 401 means a wrong password, not an expired session -- the
  // interceptor above must not treat it as one. Scoped to the exact
  // request PATH, never to "is there currently a token in the store": an
  // already-expired token is cleared proactively by `store.ts`'s own
  // `checkExpiry` before the request is even sent (see `store.ts`'s
  // window-focus listener and `initialToken`), so a token-presence
  // condition here would ALSO skip the real "401 during an authenticated
  // session" case this interceptor exists for -- exactly the alternative
  // the orchestrator rejected when approving this plan.
  describe('the /auth/login exemption from the 401 interceptor', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('does not clear the token or navigate when a 401 comes from /auth/login', async () => {
      server.use(
        http.post('http://localhost:8000/auth/login', () =>
          HttpResponse.json({ detail: 'Invalid credentials', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')
      const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve())

      const { apiRequest } = await import('./client')

      await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toEqual({ status: 401, code: null })
      expect(useSessionStore.getState().token).toBe('a-valid-looking-token')
      expect(navigateSpy).not.toHaveBeenCalled()

      useSessionStore.getState().clearToken()
    })

    // Triangulates the exemption's own scope: a 401 from any OTHER path
    // still clears the token and navigates -- the exemption is anchored to
    // the literal `/auth/login` path, not a blanket weakening of the
    // interceptor above.
    it('still clears the token and navigates for a 401 from a non-login endpoint', async () => {
      server.use(
        http.get('http://localhost:8000/reservations', () =>
          HttpResponse.json({ detail: 'Invalid or expired token', code: null }, { status: 401 }),
        ),
      )
      const { router } = await import('../../routes')
      const { useSessionStore } = await import('../session/store')
      useSessionStore.getState().setToken('a-valid-looking-token')
      await router.navigate('/inicio')
      const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve())

      const { apiRequest } = await import('./client')

      await expect(apiRequest('/reservations')).rejects.toEqual({ status: 401, code: null })
      expect(useSessionStore.getState().token).toBeNull()
      expect(navigateSpy).toHaveBeenCalledWith('/login', { state: { expired: true, from: '/inicio' } })

      useSessionStore.getState().clearToken()
    })
  })
})
