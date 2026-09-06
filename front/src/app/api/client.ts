import { env } from '../../env'
import { router } from '../../routes'
import { NETWORK_FAILURE_STATUS, normalise } from '../../shared/errors/normalise'
import { useSessionStore } from '../session/store'

// design D25/D30/D31: this is the ONE module in the whole tree that issues
// a network request against the backend (1.25's standing regression
// guard), and now also the one module that reads the token and sets an
// `Authorization` header (D31 point 1: "the header cannot be attached by
// mistake because the code that attaches it is unreachable" from
// `src/public/**`). Both became possible only once the session store
// existed (task 3.1's approval gate, D29, CRITICAL domain) -- writing
// either earlier would have smuggled an unapproved security decision into
// a foundation commit. Base URL comes from `env.ts` (D37) once, per call.
//
// The 401 branch is the REACTIVE half of D29(b) (approved 2026-09-05): any
// 401, from any request, anywhere, clears the token and navigates through
// the ROUTER -- never `window.location`. A location assignment reloads the
// document and destroys the owner's in-progress wizard draft; 5.30/5.31
// depend on this holding, and the rule is enforced structurally here by
// calling `router.navigate` (imported from `routes.tsx`, never
// `window.location`) rather than merely documented.

function buildRequestHeaders(init: RequestInit | undefined): Headers {
  const headers = new Headers(init?.headers)
  const { token } = useSessionStore.getState()
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/**
 * Issues one request against the API and decodes its JSON body.
 *
 * Every non-2xx response and every thrown network failure is routed
 * through `normalise()` (1.19) into a structured `ApiError` (1.17) and
 * thrown -- never a raw `Response`, a raw exception, or an unhandled
 * rejection reaches caller code. A `401` additionally clears the session
 * (3.13/3.14, owner-session spec's "An Expired Or Invalid Token Clears The
 * Session And Returns To Ingresar") before the same normalised error is
 * thrown, so a caller that happens to catch it still sees no token left
 * behind and no silent re-authentication.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, { ...init, headers: buildRequestHeaders(init) })
  } catch (cause) {
    // `fetch` rejects with an indistinguishable TypeError for a dropped
    // connection and for a CORS rejection (design D32) -- both normalise
    // to the same structured object under the network-failure sentinel,
    // never an unhandled raw exception.
    if (cause instanceof TypeError) {
      throw normalise(NETWORK_FAILURE_STATUS, undefined)
    }
    throw cause
  }

  if (response.status === 401) {
    useSessionStore.getState().clearToken()
    router.navigate('/login')
    throw normalise(response.status, await parseJsonBody(response))
  }

  if (!response.ok) {
    throw normalise(response.status, await parseJsonBody(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
