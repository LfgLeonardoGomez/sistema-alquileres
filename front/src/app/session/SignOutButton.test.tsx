import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_COPY } from '../../shared/copy/session'

// owner-session spec's "The Owner Can Sign Out From Inside The App" +
// "Signing Out Lands On The Sign-In Screen", Note C(i)/(ii) (approved
// 10.1(f)). Asserted through the behaviour a click produces -- the
// session clearing and the router actually landing on /login -- never by
// spying on `useSignOut`, matching `HomeScreen.test.tsx`'s own
// established preference for a real router over a mocked navigate.

function renderSignOutButtonAt(Component: ComponentType) {
  const router = createMemoryRouter(
    [
      { path: '/protected', Component },
      { path: '/login', Component: () => <p data-testid="login-stand-in" /> },
    ],
    { initialEntries: ['/protected'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('SignOutButton', () => {
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

  // 10.33 [RED]: renders `SESSION_COPY.signOut` and, on click, leaves the
  // owner on /login with the session cleared.
  it('renders SESSION_COPY.signOut and, on click, leaves her on /login with the session cleared', async () => {
    const { useSessionStore } = await import('./store')
    useSessionStore.getState().setToken('a.b.c')

    const { SignOutButton } = await import('./SignOutButton')
    const user = userEvent.setup()
    const router = renderSignOutButtonAt(SignOutButton)

    await user.click(screen.getByRole('button', { name: SESSION_COPY.signOut }))

    expect(await screen.findByTestId('login-stand-in')).toBeInTheDocument()
    expect(useSessionStore.getState()).toMatchObject({ token: null, isAuthenticated: false })
    expect(router.state.location.pathname).toBe('/login')
  })
})
