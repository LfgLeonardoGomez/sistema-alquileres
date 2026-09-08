import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COPY } from '../../shared/copy/session'
import { server } from '../../test/setup'

// owner-session spec's "The Owner Can Sign Out From Inside The App" +
// "A Deliberate Sign-Out Is Not Presented As An Expired Session", Note
// C(iii) (approved 10.1(f)). A hook rather than a handler inlined in a
// screen -- sign-out is three coupled effects (clear the token, discard
// the draft, navigate) whose ORDER is load-bearing (10.29), and an order
// that matters belongs in one unit with its own bar, not spread across a
// click handler.
//
// Dynamic-import discipline (matching `Login.test.tsx`/`store.test.ts`'s
// own note): `useSignOut` transitively imports `./store`, which reads
// `localStorage` at module load, so every test needs a fresh module graph
// (`vi.resetModules()`) and the env vars set before importing.

const TOKEN_STORAGE_KEY = 'owner-session-token'

// A harness component, not the hook called bare -- `useSignOut` calls
// `useNavigate()` internally and needs a Router context, the same
// constraint every screen-level test in this codebase already works
// around (`renderLoginAt`, `renderHomeScreen`).
async function renderSignOutHarness(initialEntry: string = '/protected') {
  const { useSignOut } = await import('./useSignOut')

  function Harness() {
    const signOut = useSignOut()
    return <button type="button" aria-label="trigger sign-out" onClick={signOut} />
  }

  const router = createMemoryRouter(
    [
      { path: '/protected', Component: Harness },
      { path: '/login', Component: () => <p data-testid="login-stand-in" /> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('useSignOut', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    Object.assign(import.meta.env, originalEnv)
  })

  // 10.26 [RED]: calling the hook clears the session -- the store ends at
  // `{ token: null, isAuthenticated: false }` and `localStorage` no longer
  // holds the token key.
  it('clears the session: the store and localStorage both end empty', async () => {
    const { useSessionStore } = await import('./store')
    useSessionStore.getState().setToken('a.b.c')

    await renderSignOutHarness()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'trigger sign-out' }))

    expect(useSessionStore.getState()).toMatchObject({ token: null, isAuthenticated: false })
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  // 10.28 [TRIANGULATE]: three further assertions with different
  // observable outcomes than the store-shape check above -- the ones a
  // copy-paste from `client.ts`'s 401 branch would get wrong, since that
  // branch's whole job is to set both `expired` and `from`.
  it('ends on /login after signing out', async () => {
    const { useSessionStore } = await import('./store')
    useSessionStore.getState().setToken('a.b.c')

    const router = await renderSignOutHarness()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'trigger sign-out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('navigates with replace, so the back button does not return to the screen she left', async () => {
    const { useSessionStore } = await import('./store')
    useSessionStore.getState().setToken('a.b.c')

    const router = await renderSignOutHarness()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'trigger sign-out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    // `replace: true` means the `/protected` entry was overwritten, not
    // pushed alongside -- there is nothing earlier in history to return
    // to, so going back stays on /login instead of bouncing her back to
    // the authenticated screen she just left.
    router.navigate(-1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('carries no expired flag and no recorded origin -- a deliberate exit is not an expired session', async () => {
    const { useSessionStore } = await import('./store')
    useSessionStore.getState().setToken('a.b.c')

    const router = await renderSignOutHarness()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'trigger sign-out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.state).toBeNull()
  })

  // 10.29 [RED][TRAP]: the ordering trap 10.11 creates. Rendered through a
  // real memory router carrying both /inicio and the REAL `LoginScreen`
  // (not a stand-in), signing out must LAND on the sign-in form and stay
  // there -- if the hook navigated before clearing, `LoginScreen`'s own
  // mount-time guard would still see `isAuthenticated: true` and 10.11's
  // redirect would bounce her straight back to /inicio, so a sign-out
  // that looks correct in isolation would do nothing at all in the app.
  //
  // Two assertions, deliberately different in what they can catch.
  // **Observed, recorded rather than silently picked:** the behavioural
  // one alone (a DOM query proving she lands on, and stays on, the real
  // form) does NOT have teeth against a plain statement swap in this
  // codebase's async router model -- `clearToken()` is synchronous
  // zustand `set()`, and `router.navigate()`'s actual transition (and
  // therefore `LoginScreen`'s mount) is deferred past the click handler's
  // own synchronous return, so by the time `LoginScreen` actually mounts,
  // BOTH statements have already run regardless of which came first,
  // and `wasAlreadyAuthenticated`'s lazy `useState` initialiser reads an
  // already-cleared store either way. Verified empirically before
  // settling on the second assertion below, not assumed: swapping the two
  // statements and re-running left this behavioural assertion GREEN.
  // The second assertion -- a direct call-order spy on the store action
  // and the router's own `navigate`, the same style 10.20's own Observed
  // note already established for an ordering-sensitive case a rendered
  // assertion could not reliably pin -- is the one that actually catches
  // the reversal, proved below.
  it('[TRAP] lands on the sign-in form and stays there, and calls clearToken() strictly before navigate()', async () => {
    // tenant-from-url change: the real `LoginScreen` (used here, unlike
    // every other test in this file's own stand-in) now fetches `GET
    // /public/{slug}/contact` on mount -- this test does not care about
    // the resolved tenant name, only that the form renders.
    server.use(
      http.get('http://localhost:8000/public/:slug/contact', () =>
        HttpResponse.json({ name: 'Tenant', whatsapp: null }),
      ),
    )
    const { useSessionStore } = await import('./store')
    const { LoginScreen } = await import('./LoginScreen')
    useSessionStore.getState().setToken('a.b.c')
    const clearTokenSpy = vi.spyOn(useSessionStore.getState(), 'clearToken')

    const { useSignOut } = await import('./useSignOut')
    function Harness() {
      const signOut = useSignOut()
      return <button type="button" aria-label="trigger sign-out" onClick={signOut} />
    }
    const router = createMemoryRouter(
      [
        { path: '/inicio', Component: Harness },
        { path: '/login', Component: LoginScreen },
      ],
      { initialEntries: ['/inicio'] },
    )
    const navigateSpy = vi.spyOn(router, 'navigate')
    render(<RouterProvider router={router} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'trigger sign-out' }))

    // Never a synchronous check against router state alone -- the router's
    // location commits before React re-renders, so only an awaited DOM
    // query proves she actually landed on, and stayed on, the real form.
    expect(await screen.findByLabelText(SESSION_COPY.emailLabel)).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    expect(clearTokenSpy).toHaveBeenCalledOnce()
    expect(navigateSpy).toHaveBeenCalledOnce()
    expect(clearTokenSpy.mock.invocationCallOrder[0]).toBeLessThan(navigateSpy.mock.invocationCallOrder[0]!)
  })

  // 10.31 [RED]: Note C(iii) -- with a wizard draft holding a cabin,
  // dates, and a guest's name and phone, signing out leaves
  // `useWizardDraftStore.getState()` at its empty shape. Pinned against a
  // false pass by seeding all four fields and asserting all four are
  // gone, not merely that the store is truthy (5.27's own store test sets
  // this same precedent).
  it('discards an in-progress reservation draft', async () => {
    const { useSessionStore } = await import('./store')
    const { useWizardDraftStore } = await import('../reservations/wizard/store')
    useSessionStore.getState().setToken('a.b.c')
    useWizardDraftStore.getState().setCabin({ id: 'cab-1', name: 'Casa Azul' })
    useWizardDraftStore.getState().setDates({ checkIn: '2026-09-08' as never, checkOut: '2026-09-12' as never })
    useWizardDraftStore.getState().setGuest({ id: 'cli-1', fullName: 'Marta González', phone: '1122334455' })
    useWizardDraftStore.getState().setPrice('per_night', 4500000)

    await renderSignOutHarness()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'trigger sign-out' }))

    expect(useWizardDraftStore.getState()).toMatchObject({
      cabin: null,
      dates: null,
      guest: null,
      priceMode: null,
      amount: null,
    })
  })
})
