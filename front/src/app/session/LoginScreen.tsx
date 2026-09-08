import { type FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { apiRequest } from '../api/client'
import { SESSION_COPY } from '../../shared/copy/session'
import { env } from '../../env'
import type { ApiError } from '../../shared/errors/ApiError'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, fieldLabelClass, inputClass } from '../../shared/ui'
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
  const [submitError, setSubmitError] = useState<string | null>(null)
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
    setSubmitError(null)
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
    } catch (caught) {
      // owner-session spec's "A rejected sign-in navigates nowhere"
      // (10.9(b)): she stays on the form. Note D fix (owner-approved
      // 2026-09-07, "si dale"): this catch no longer swallows the
      // rejection. `apiRequest` never throws anything but a normalised
      // `ApiError` (see `client.ts`'s own docs on `issueRequest`), so the
      // cast below is safe under this module's own invariant. A 401 here
      // is specifically a wrong email/password -- `client.ts` now exempts
      // `/auth/login` from its 401 interceptor (scoped to the path, never
      // to token presence), so this is the only place a login 401 is
      // handled, and it renders the credential-rejection copy rather than
      // the unrelated expired-session message. Anything else (network
      // failure, server fault) reuses `resolveErrorCopy`'s own table
      // (design D32) instead of inventing a second one.
      const apiError = caught as ApiError
      setSubmitError(
        apiError.status === 401 ? SESSION_COPY.invalidCredentialsMessage : resolveErrorCopy(apiError),
      )
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-page px-[26px] pt-[150px] pb-[60px]">
      <div className="mb-12 flex flex-col gap-2">
        <div className="text-[34px] font-extrabold tracking-tight text-primary">{SESSION_COPY.title}</div>
        <div className="text-lg text-muted">{SESSION_COPY.subtitle}</div>
      </div>
      {showExpiredMessage ? <p className="mb-4 text-base text-warm">{SESSION_COPY.expiredMessage}</p> : null}
      {submitError !== null ? (
        <p role="alert" className="mb-4 text-base font-bold text-warm">
          {submitError}
        </p>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{SESSION_COPY.emailLabel}</span>
          <input
            className={inputClass}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{SESSION_COPY.passwordLabel}</span>
          <input
            className={inputClass}
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" className="mt-3">
          {SESSION_COPY.submit}
        </Button>
      </form>
    </div>
  )
}
