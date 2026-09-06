import { type FormEvent, useState } from 'react'
import { useSearchParams } from 'react-router'
import { apiRequest } from '../api/client'
import { SESSION_COPY } from '../../shared/copy/session'
import { env } from '../../env'
import { useSessionStore } from './store'

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

export function LoginScreen() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const setToken = useSessionStore((state) => state.setToken)

  // D31: "the login route reads it from `?tenant=` if present, otherwise
  // from the build-time `VITE_TENANT_SLUG`" -- resolved here, at submit
  // time, and NEVER rendered as a field (the test above already proves no
  // such field exists).
  const tenantSlug = searchParams.get('tenant') ?? env.tenantSlug

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_slug: tenantSlug, email, password }),
    })
    setToken(response.access_token)
  }

  return (
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
  )
}
