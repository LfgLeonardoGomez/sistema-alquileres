import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { ComponentType } from 'react'
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

function renderLoginAt(Component: ComponentType, path: string) {
  const router = createMemoryRouter([{ path: '/login', Component }], {
    initialEntries: [path],
  })
  return render(<RouterProvider router={router} />)
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
})
