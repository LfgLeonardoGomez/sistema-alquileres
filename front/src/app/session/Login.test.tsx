import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { ComponentType } from 'react'
import { Temporal } from 'temporal-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COPY } from '../../shared/copy/session'
import { server } from '../../test/setup'

// design D31 (the tenant slug enters only at login) + owner-session spec's
// "Login Requires Only Email And Password". Rendered through a router, the
// same way `routes.tsx` will eventually mount it (task 3.6/3.7 needs the
// URL's own `?tenant=` search param) -- not wired into the real
// `routeConfig` by this run, since no task in 3.2-3.14 asks for that; a
// local memory router is enough to exercise the URL-reading behaviour these
// tasks actually specify.
//
// Dynamic-import discipline (matching `env.test.ts`/`client.test.ts`):
// `LoginScreen` transitively imports `app/api/client.ts`, which reads
// `env.ts` at module load. `import.meta.env` must be set and the module
// graph freshly re-evaluated (`vi.resetModules()`) before each test, not
// once for the whole file.

// 10.7's own fixture widening: a stand-in destination is needed for
// "she left the form" to be asserted against a real place she landed,
// rather than against the form's mere absence. A catch-all rather than one
// explicit route per destination -- `resolveReturnPath` can send her to
// `/inicio` or to whatever `from` was recorded (`/reserva/nueva/3` in
// 10.9(a)), and this fixture's job is only to prove WHERE the router ended
// up (`router.state.location.pathname`), not to render each destination's
// real screen.
function renderLoginAt(Component: ComponentType, entry: string | { pathname: string; state?: unknown }) {
  const router = createMemoryRouter(
    [
      { path: '/login', Component },
      { path: '*', Component: () => <p data-testid="destination" /> },
    ],
    { initialEntries: [entry] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const TOKEN_STORAGE_KEY = 'owner-session-token'

// Mirrors `store.test.ts`'s own helper -- a syntactically real JWT shape
// carrying only `exp` (D29(b)'s "unverified, and only exp"), needed here
// because 10.10/10.11's guard reads the store's LIVE `isAuthenticated`,
// which is only true for a token this module's own `initialToken()`
// considers unexpired.
function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function tokenWithExp(expEpochSeconds: number): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({ sub: 'user-1', tid: 'tenant-1', exp: expEpochSeconds }))
  return `${header}.${payload}.not-a-real-signature`
}

function farFutureEpochSeconds(): number {
  return Math.floor(Temporal.Instant.from('2099-01-01T00:00:00Z').epochMilliseconds / 1000)
}

describe('LoginScreen', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    localStorage.clear()
    Object.assign(import.meta.env, originalEnv)
  })

  it('renders exactly two input fields -- email and password -- and none for a tenant', async () => {
    const { LoginScreen } = await import('./LoginScreen')
    renderLoginAt(LoginScreen, '/login')

    const emailField = screen.getByLabelText(SESSION_COPY.emailLabel)
    const passwordField = screen.getByLabelText(SESSION_COPY.passwordLabel)

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(emailField).toBeInTheDocument()
    expect(passwordField).toBeInTheDocument()
    expect(screen.queryByLabelText(/tenant|slug|workspace/i)).not.toBeInTheDocument()
  })

  // owner-session spec's "The Tenant Slug Enters Only Through The URL,
  // Never A Form Field" -- two scenarios, both asserting on the REQUEST
  // BODY the login submission sends, never on anything rendered (the slug
  // is never a field, per the test above).
  it('sends the ?tenant= query parameter as tenant_slug when present', async () => {
    let capturedBody: unknown
    server.use(
      http.post('http://localhost:8000/auth/login', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ access_token: 'a.b.c', token_type: 'bearer' })
      }),
    )
    const { LoginScreen } = await import('./LoginScreen')
    const user = userEvent.setup()
    renderLoginAt(LoginScreen, '/login?tenant=mar-del-tuyu-cabins')

    await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
    await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'correct-password-123')
    await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

    expect(capturedBody).toMatchObject({ tenant_slug: 'mar-del-tuyu-cabins' })
  })

  it('falls back to the build-time default tenant slug when no ?tenant= is present', async () => {
    let capturedBody: unknown
    server.use(
      http.post('http://localhost:8000/auth/login', async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ access_token: 'a.b.c', token_type: 'bearer' })
      }),
    )
    const { LoginScreen } = await import('./LoginScreen')
    const user = userEvent.setup()
    renderLoginAt(LoginScreen, '/login')

    await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
    await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'correct-password-123')
    await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

    expect(capturedBody).toMatchObject({ tenant_slug: 'mar-del-tuyu-cabins' })
  })

  // owner-session spec's "No Password-Reset Affordance Is Rendered".
  // Labelled [TEST], not [RED] (task 3.8): 3.5's screen never had one, so
  // this cannot fail given that construction -- it is a standing regression
  // guard, not a cycle with its own red phase.
  //
  // CONTRADICTION FLAGGED, not silently resolved: the design handoff
  // (`docs/design-handoff/README.md`, screen 01 "Ingresar") explicitly
  // draws this element -- "Text link 'Me olvidé la contraseña' centered,
  // 17px muted" -- as part of the final, settled screen design (binding
  // input 7: "the design handoff is settled"). `design.md`'s own Open
  // Question 6 asserts the opposite as already true ("reset is deferred,
  // the link is absent from screen 01"), and the owner-session spec turns
  // that assertion into a MUST-NOT requirement this task enforces. Followed
  // the spec and this task's literal, unambiguous text (both were written
  // AFTER the handoff and both explicitly discuss and reject the link,
  // rather than merely omitting it by oversight) over the handoff's older
  // drawing -- the same resolution direction 2.29's WhatsApp contradiction
  // took (the newer, explicit decision wins over the artifact it turned out
  // to disagree with), but recorded here rather than picked silently.
  it('never renders a password-reset affordance, in any state', async () => {
    const { LoginScreen } = await import('./LoginScreen')
    renderLoginAt(LoginScreen, '/login')

    expect(screen.queryByText(/olvid.*contraseñ/i)).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="reset"], a[href*="olvid"]')).toBeNull()
  })

  // Triangulates task 3.15/3.16's real-401-redirect case (`client.test.tsx`):
  // a plain visit to `/login` (typed directly, bookmarked, or opened fresh)
  // carries no navigation state at all, so the approved re-entry copy must
  // NOT appear -- it is conditional on an actual redirect, not always-on
  // screen chrome.
  it('renders no re-entry message on a plain visit, only on an actual 401 redirect', async () => {
    const { LoginScreen } = await import('./LoginScreen')
    renderLoginAt(LoginScreen, '/login')

    expect(screen.queryByText(SESSION_COPY.expiredMessage)).not.toBeInTheDocument()
  })

  // owner-session spec's "A Successful Sign-In Leaves The Sign-In Screen" --
  // 10.7 [RED] / 10.8 [GREEN]: a successful sign-in with no recorded origin
  // leaves the form and lands on /inicio.
  describe('after a successful sign-in', () => {
    it('leaves the form and lands on /inicio when no origin was recorded', async () => {
      server.use(
        http.post('http://localhost:8000/auth/login', () =>
          HttpResponse.json({ access_token: 'a.b.c', token_type: 'bearer' }),
        ),
      )
      const { LoginScreen } = await import('./LoginScreen')
      const user = userEvent.setup()
      const router = renderLoginAt(LoginScreen, '/login')

      await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
      await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'correct-password-123')
      await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

      await waitFor(() => expect(router.state.location.pathname).toBe('/inicio'))
      expect(screen.queryByLabelText(SESSION_COPY.emailLabel)).not.toBeInTheDocument()

      const { useSessionStore } = await import('./store')
      useSessionStore.getState().clearToken()
    })

    // 10.9(a) [TRIANGULATE]: a recorded origin overrides the /inicio
    // fallback -- the case a hardcoded destination in 10.8 cannot pass.
    it('returns to the recorded origin instead of /inicio when one was recorded', async () => {
      server.use(
        http.post('http://localhost:8000/auth/login', () =>
          HttpResponse.json({ access_token: 'a.b.c', token_type: 'bearer' }),
        ),
      )
      const { LoginScreen } = await import('./LoginScreen')
      const user = userEvent.setup()
      const router = renderLoginAt(LoginScreen, {
        pathname: '/login',
        state: { expired: true, from: '/reserva/nueva/3' },
      })

      await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
      await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'correct-password-123')
      await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

      await waitFor(() => expect(router.state.location.pathname).toBe('/reserva/nueva/3'))

      const { useSessionStore } = await import('./store')
      useSessionStore.getState().clearToken()
    })

    // 10.9(b) [TRIANGULATE]: a sign-in the API rejects navigates nowhere --
    // she is still on the form, and /inicio was never reached. Note in the
    // test, not fixed here: that 401 also goes through `client.ts`'s own
    // interceptor (Note D's wart), which is why this asserts WHERE she is
    // not rather than what she sees.
    it('navigates nowhere when the sign-in is rejected', async () => {
      server.use(
        http.post('http://localhost:8000/auth/login', () =>
          HttpResponse.json({ detail: 'Invalid credentials', code: null }, { status: 401 }),
        ),
      )
      const { LoginScreen } = await import('./LoginScreen')
      const user = userEvent.setup()
      const router = renderLoginAt(LoginScreen, '/login')

      await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
      await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'wrong-password')
      await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

      await waitFor(() => expect(screen.queryByRole('button', { name: SESSION_COPY.submit })).toBeInTheDocument())
      expect(router.state.location.pathname).not.toBe('/inicio')
      expect(router.state.location.pathname).not.toBe('/reserva/nueva/3')
      expect(screen.getByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()

      const { useSessionStore } = await import('./store')
      useSessionStore.getState().clearToken()
    })

    // Note D fix, owner-approved 2026-09-07 ("si dale"): a wrong password is
    // itself a 401, and until this task `client.ts`'s own interceptor could
    // not tell that apart from an expired session, clearing the (already
    // empty) session and re-navigating to `/login` with `expired: true` --
    // the approved re-entry copy shown for a typo instead of a real
    // rejection message. `client.ts` now exempts `/auth/login` from that
    // interceptor (scoped to the path, never to token presence -- see that
    // file's own comment), and this screen renders the credential-rejection
    // copy in its place.
    it('shows the credential-rejection message on a wrong password, not the expired-session copy, and stays on /login', async () => {
      server.use(
        http.post('http://localhost:8000/auth/login', () =>
          HttpResponse.json({ detail: 'Invalid credentials', code: null }, { status: 401 }),
        ),
      )
      const { LoginScreen } = await import('./LoginScreen')
      const user = userEvent.setup()
      const router = renderLoginAt(LoginScreen, '/login')

      await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
      await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'wrong-password')
      await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

      expect(await screen.findByText(SESSION_COPY.invalidCredentialsMessage)).toBeInTheDocument()
      expect(screen.queryByText(SESSION_COPY.expiredMessage)).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')

      const { useSessionStore } = await import('./store')
      useSessionStore.getState().clearToken()
    })

    // Same rejection, triangulated on a different axis: with the interceptor
    // no longer remounting this screen via a router navigation, nothing
    // resets the two controlled inputs -- what she typed must still be
    // there for her to correct.
    it('keeps the typed email and password after a rejected submit', async () => {
      server.use(
        http.post('http://localhost:8000/auth/login', () =>
          HttpResponse.json({ detail: 'Invalid credentials', code: null }, { status: 401 }),
        ),
      )
      const { LoginScreen } = await import('./LoginScreen')
      const user = userEvent.setup()
      renderLoginAt(LoginScreen, '/login')

      await user.type(screen.getByLabelText(SESSION_COPY.emailLabel), 'owner@example.com')
      await user.type(screen.getByLabelText(SESSION_COPY.passwordLabel), 'wrong-password')
      await user.click(screen.getByRole('button', { name: SESSION_COPY.submit }))

      await screen.findByText(SESSION_COPY.invalidCredentialsMessage)
      expect(screen.getByLabelText(SESSION_COPY.emailLabel)).toHaveValue('owner@example.com')
      expect(screen.getByLabelText(SESSION_COPY.passwordLabel)).toHaveValue('wrong-password')

      const { useSessionStore } = await import('./store')
      useSessionStore.getState().clearToken()
    })
  })

  // owner-session spec's "An Authenticated Visitor Is Not Shown The Sign-In
  // Screen" -- 10.10 [RED] / 10.11 [GREEN]: a stored, unexpired token skips
  // the form entirely.
  describe('with a stored, unexpired token', () => {
    it('redirects to /inicio and never renders the sign-in form', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, tokenWithExp(farFutureEpochSeconds()))

      const { LoginScreen } = await import('./LoginScreen')
      const router = renderLoginAt(LoginScreen, '/login')

      await waitFor(() => expect(router.state.location.pathname).toBe('/inicio'))
      expect(screen.queryByLabelText(SESSION_COPY.emailLabel)).not.toBeInTheDocument()
    })

    // 10.12 [TRIANGULATE]: the two inputs that must NOT redirect.
    it('renders the form as always when no token is held', async () => {
      const { LoginScreen } = await import('./LoginScreen')
      renderLoginAt(LoginScreen, '/login')

      expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
    })

    it('renders the form and the expiry message when the session was just cleared by a 401', async () => {
      const { LoginScreen } = await import('./LoginScreen')
      renderLoginAt(LoginScreen, { pathname: '/login', state: { expired: true } })

      expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
      expect(screen.getByText(SESSION_COPY.expiredMessage)).toBeInTheDocument()
    })
  })
})
