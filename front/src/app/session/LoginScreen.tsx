import { type FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { apiRequest } from '../api/client'
import { SESSION_COPY } from '../../shared/copy/session'
import { env } from '../../env'
import { useSessionStore } from './store'
import { resolveReturnPath } from './returnPath'

// owner-session spec: "Login Requires Only Email And Password" -- exactly
// two fields, and MUST NOT present a tenant/slug/workspace field of any
// kind (D31: the slug enters only through the URL, task 3.6/3.7). No
// "Me olvidé la contraseña" affordance either (task 3.8) -- see this
// module's own note there for the contradiction against the design
// handoff's screen 01, which draws one.

type LoginResponse = {
  readonly access_token: string
  readonly token_type: string
}

// Task 3.15/3.16, D29(c), extended by 10.1(b)/Note B: the shape
// `client.ts`'s 401 interceptor (10.21) and `RequireSession` (10.19) both
// attach to their `navigate('/login', { state: ... })` calls. Read here,
// never written here -- this screen only ever observes the flag(s) a
// redirect left behind. `from` is opaque to this type; `resolveReturnPath`
// (10.2-10.6) is the one place that validates it.
type LoginLocationState = { readonly expired?: boolean; readonly from?: unknown } | null

export function LoginScreen() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const setToken = useSessionStore((state) => state.setToken)
  // owner-session spec's "An Authenticated Visitor Is Not Shown The Sign-In
  // Screen" (10.10/10.11), Note A's same `<Navigate replace/>` shape as
  // `RequireSession`, `Wizard.tsx` and `EditReservation.tsx`. Captured ONCE
  // at mount via a lazy `useState` initialiser, not subscribed live to the
  // store: the only case this guards is "she already held a session when
  // this screen mounted" (a bookmark, a restored tab, a token surviving a
  // reload). Reading it live instead would also fire the instant a
  // successful submit below calls `setToken`, racing this component's own
  // explicit `navigate(resolveReturnPath(...))` call for control of where
  // she lands. 10.12's own ordering note confirms this is safe: `client.ts`
  // clears the token BEFORE navigating on a 401, so `isAuthenticated` is
  // already false by the time this screen next mounts.
  const [wasAlreadyAuthenticated] = useState(() => useSessionStore.getState().isAuthenticated)

  // `location.state` is `null` on a plain visit to `/login` (typing it in
  // the address bar, or a bookmark) and only carries `{expired: true}` when
  // `client.ts`'s 401 interceptor performed the navigation -- the
  // structural difference between "she needs to sign in again" and "she is
  // just opening the app".
  const showExpiredMessage = (location.state as LoginLocationState)?.expired === true

  // D31: "the login route reads it from `?tenant=` if present, otherwise
  // from the build-time `VITE_TENANT_SLUG`" -- resolved here, at submit
  // time, and NEVER rendered as a field (the test above already proves no
  // such field exists).
  const tenantSlug = searchParams.get('tenant') ?? env.tenantSlug

  if (wasAlreadyAuthenticated) {
    return <Navigate to="/inicio" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_slug: tenantSlug, email, password }),
      })
      setToken(response.access_token)
      // owner-session spec's "A Successful Sign-In Leaves The Sign-In
      // Screen": `replace`, not push, so the back button does not land her
      // on a form she has already completed (10.8). The destination is
      // 10.1(c)'s approved rule -- the recorded `from` when it is a valid
      // in-app path, otherwise `/inicio` -- resolved by 10.2-10.6's own
      // unit, never inlined here.
      navigate(resolveReturnPath(location.state), { replace: true })
    } catch {
      // owner-session spec's "A rejected sign-in navigates nowhere"
      // (10.9(b)): she stays on the form. The thrown `ApiError` is
      // swallowed here rather than surfaced -- this screen never rendered
      // one before this task either -- and this catch's only added job is
      // to stop that rejection reaching the console as an unhandled
      // promise rejection. Note D's wart, not fixed here: a wrong password
      // is itself a 401, so it also passes through `client.ts`'s own
      // interceptor, which clears the (already-empty) session and
      // re-navigates to `/login` carrying `expired: true` -- the approved
      // re-entry copy for an EXPIRED session, shown for a typo instead.
      // Out of this phase's scope (Note D), and irrelevant to this catch,
      // which only prevents a crash.
    }
  }

  return (
    <>
      {showExpiredMessage ? <p>{SESSION_COPY.expiredMessage}</p> : null}
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label>
          {SESSION_COPY.emailLabel}
          <input type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          {SESSION_COPY.passwordLabel}
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit">{SESSION_COPY.submit}</button>
      </form>
    </>
  )
}
