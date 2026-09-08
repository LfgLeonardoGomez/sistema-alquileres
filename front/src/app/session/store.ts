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
// The token is persisted to `localStorage` (approved D29(a)).
//
// `tenantSlug` (tenant-from-url change, owner-approved 2026-09-08): no
// longer a build-time constant read once from `env.ts` and left alone --
// this field is now LIVE, persisted to `localStorage` the same way the
// token is, via `setTenantSlug`/`persistTenantSlug` below. Deliberately
// NOT cleared by `clearToken`: the token identifies WHO she is and expires;
// the slug identifies WHICH tenant, a fact a 401 does not change. This is
// what makes the lockout guard work -- `client.ts`'s 401 interceptor
// navigates to a BARE `/login` with no slug in the URL, and `LoginScreen`
// (`app/session/LoginScreen.tsx`) falls back to this persisted value so an
// expired session does not strand her on a form that cannot know which
// tenant to authenticate against. `env.ts`'s `tenantSlug` remains the very
// last resort, read once here at module load, for a browser that has never
// persisted one yet.

const TOKEN_STORAGE_KEY = 'owner-session-token'
const TENANT_SLUG_STORAGE_KEY = 'owner-session-tenant-slug'

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
   * Persists the resolved tenant slug (`localStorage`, same discipline as
   * `setToken`) and updates state. Called by `LoginScreen` whenever it
   * resolves a slug, from any source in its own resolution order --
   * deliberately NOT limited to a successful sign-in, so the lockout guard
   * has a value to fall back to even before she submits the form.
   */
  readonly setTenantSlug: (slug: string) => void
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

function readStoredTenantSlug(): string | null {
  try {
    return localStorage.getItem(TENANT_SLUG_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistTenantSlug(slug: string): void {
  try {
    localStorage.setItem(TENANT_SLUG_STORAGE_KEY, slug)
  } catch {
    // Same rationale as `persistToken` above: a private-browsing quota
    // rejection must not crash the app.
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
  tenantSlug: readStoredTenantSlug() ?? env.tenantSlug,
  isAuthenticated: startingToken !== null,

  setToken(token) {
    persistToken(token)
    set({ token, isAuthenticated: true })
  },

  clearToken() {
    clearStoredToken()
    set({ token: null, isAuthenticated: false })
  },

  setTenantSlug(slug) {
    persistTenantSlug(slug)
    set({ tenantSlug: slug })
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
