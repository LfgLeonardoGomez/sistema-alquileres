import { Temporal } from 'temporal-polyfill'
import { create } from 'zustand'
import { env } from '../../env'

// design D29 (approved 2026-09-05, `tasks.md` 3.1) / D30: the first of the
// app's exactly two Zustand stores. It qualifies on D30's own written
// criterion -- "something outside the React tree must read it" --
// because `app/api/client.ts`'s 401 interceptor is not a component and
// cannot use a hook. `useSessionStore.getState()`/`.setState()` are the
// non-hook access points that make that possible.
//
// The token is the ONLY thing persisted (to `localStorage`, approved
// D29(a)). `tenantSlug` is read fresh from `env.ts` at module load, never
// persisted -- it is a build-time constant, not session state.

const TOKEN_STORAGE_KEY = 'owner-session-token'

export type SessionState = {
  readonly token: string | null
  readonly tenantSlug: string
  readonly isAuthenticated: boolean
}

type SessionActions = {
  /** Persists the token (D29(a): `localStorage`) and marks the session authenticated. */
  readonly setToken: (token: string) => void
  /** Clears the token from both memory and storage -- the 401 interceptor's own action (3.14). */
  readonly clearToken: () => void
  /**
   * Proactive expiry (D29(b)): re-checks the CURRENTLY held token's `exp`
   * claim against now and clears it if expired. Called on module load (via
   * `initialToken` below) and on every `window` focus event.
   */
  readonly checkExpiry: () => void
}

type DecodedPayload = {
  readonly exp?: unknown
}

/**
 * `exp`, and NOTHING else -- D29(b), approved binding: "never `tid`, never
 * `sub`". The claim is unverified (no signature check) and is used only to
 * decide whether sending a request is worth the trip; the server remains
 * the authority. Returns `null` for anything that does not decode to a
 * plain JWT carrying a numeric `exp`, so a malformed or foreign string is
 * treated the same as "no expiry known" rather than thrown.
 */
function decodeExpEpochSeconds(token: string): number | null {
  const payloadSegment = token.split('.')[1]
  if (payloadSegment === undefined) return null

  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const decoded = atob(padded)
    const parsed = JSON.parse(decoded) as DecodedPayload
    return typeof parsed.exp === 'number' ? parsed.exp : null
  } catch {
    return null
  }
}

// Never `new Date()` / `Date.now()` (design D26, lint-enforced) -- "now" as
// epoch seconds, the same unit `exp` carries, computed entirely through
// `Temporal`.
function nowEpochSeconds(): number {
  return Math.floor(Temporal.Now.instant().epochMilliseconds / 1000)
}

function isExpired(token: string): boolean {
  const exp = decodeExpEpochSeconds(token)
  return exp !== null && exp <= nowEpochSeconds()
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // A private-browsing quota rejection here must not crash the app --
    // the owner simply re-authenticates next open, the same residual
    // `localStorage` already accepts (D29(a)).
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // See `persistToken` above.
  }
}

// Proactive expiry, "on app start" half (D29(b)): hydrates `isAuthenticated`
// from `localStorage` at module load -- before first render, task 3.10 --
// treating an expired stored token as absent rather than surfacing it and
// clearing it a tick later.
function initialToken(): string | null {
  const stored = readStoredToken()
  if (stored === null) return null
  if (isExpired(stored)) {
    clearStoredToken()
    return null
  }
  return stored
}

const startingToken = initialToken()

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  token: startingToken,
  tenantSlug: env.tenantSlug,
  isAuthenticated: startingToken !== null,

  setToken(token) {
    persistToken(token)
    set({ token, isAuthenticated: true })
  },

  clearToken() {
    clearStoredToken()
    set({ token: null, isAuthenticated: false })
  },

  checkExpiry() {
    const { token } = get()
    if (token !== null && isExpired(token)) {
      get().clearToken()
    }
  },
}))

// Proactive expiry, "on window focus" half (D29(b)). This lives at module
// load rather than in a component's `useEffect` because the requirement is
// on the STORE, not on any particular screen being mounted -- matching
// D30's own reasoning for why this store exists (state outside the React
// tree). `typeof window` guards the SSR-less-but-still-cautious case; every
// test in this file runs under jsdom, where `window` always exists.
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    useSessionStore.getState().checkExpiry()
  })
}
