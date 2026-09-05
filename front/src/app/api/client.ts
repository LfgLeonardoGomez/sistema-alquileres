import { env } from '../../env'
import { NETWORK_FAILURE_STATUS, normalise } from '../../shared/errors/normalise'

// design D25/D30/D31: this is the ONE module in the whole tree that issues
// a network request against the backend (1.25's standing regression
// guard). Base URL comes from `env.ts` (D37) once, at call time.
//
// NO BEARER HEADER IS ATTACHED HERE, and that is deliberate rather than an
// oversight: the session store this would read from does not exist until
// Phase 3's human-approval gate (3.1) has been signed off (D29 is CRITICAL
// domain). Writing token handling here would smuggle an unapproved
// security decision into a foundation commit -- see design.md's own
// opening line. The 401 branch (clearing the token, `router.navigate`,
// never `window.location`) is 3.13/3.14, not this task.

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
 * rejection reaches caller code.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, init)
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

  if (!response.ok) {
    throw normalise(response.status, await parseJsonBody(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
