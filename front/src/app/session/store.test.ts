import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Temporal } from 'temporal-polyfill'

// design D29 (approved 2026-09-05) / D30: the first of the app's exactly
// two Zustand stores. It exists because `app/api/client.ts`'s 401
// interceptor is not a component and cannot use a hook (D30's own
// criterion). `env.ts`'s dynamic-import discipline (0.7/1.23) applies here
// too: `env.ts` reads `import.meta.env` at module load, so any test
// exercising a fresh module load must set the env vars first and import
// dynamically -- and the store itself reads `localStorage` at module load
// (to hydrate `isAuthenticated` before first render, task 3.10), so every
// test here needs the same fresh-module discipline.

const TOKEN_STORAGE_KEY = 'owner-session-token'

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Builds a syntactically real JWT shape (header.payload.signature) carrying
// only the one claim this module is approved to read, `exp` -- the
// signature segment is never verified client-side (D29(b): "unverified,
// and only exp -- never tid, never sub"), so an arbitrary string suffices.
function tokenWithExp(expEpochSeconds: number): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({ sub: 'user-1', tid: 'tenant-1', exp: expEpochSeconds }))
  return `${header}.${payload}.not-a-real-signature`
}

// `Date`/`Date.parse` are banned globally with zero exemptions (design D26,
// lint-enforced project-wide, tests included) -- a fixed far-future instant
// computed entirely through `Temporal`, the same engine `store.ts` itself
// uses for "now".
function farFutureEpochSeconds(): number {
  return Math.floor(Temporal.Instant.from('2099-01-01T00:00:00Z').epochMilliseconds / 1000)
}

describe('session store', () => {
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

  it('starts with no token, the build-time tenant slug, and isAuthenticated false', async () => {
    const { useSessionStore } = await import('./store')

    expect(useSessionStore.getState()).toMatchObject({
      token: null,
      tenantSlug: 'mar-del-tuyu-cabins',
      isAuthenticated: false,
    })
  })

  // owner-session spec's "The Token Persists Across App Opens".
  it('persists the token to localStorage on a successful setToken', async () => {
    const { useSessionStore } = await import('./store')
    const token = tokenWithExp(farFutureEpochSeconds())

    useSessionStore.getState().setToken(token)

    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(token)
    expect(useSessionStore.getState().isAuthenticated).toBe(true)
  })

  it('reopening the app with a stored, unexpired token lands on the authenticated shell directly', async () => {
    const farFutureExp = farFutureEpochSeconds()
    localStorage.setItem(TOKEN_STORAGE_KEY, tokenWithExp(farFutureExp))

    // A fresh module load simulates "reopening the app" -- the same
    // dynamic-import discipline `env.test.ts`/`client.test.ts` established,
    // needed here because the store hydrates from `localStorage` at module
    // load (task 3.10), not lazily on first read.
    const { useSessionStore } = await import('./store')

    expect(useSessionStore.getState()).toMatchObject({
      token: tokenWithExp(farFutureExp),
      isAuthenticated: true,
    })
  })

  // owner-session spec's "An Expired Or Invalid Token Clears The Session
  // And Returns To Ingresar" -- the PROACTIVE half (D29(b)): "on app start
  // and on window focus", never waiting for a 401 round-trip.
  it('treats a stored token past its exp as absent on app start', async () => {
    const pastExp = Math.floor(Temporal.Instant.from('2020-01-01T00:00:00Z').epochMilliseconds / 1000)
    localStorage.setItem(TOKEN_STORAGE_KEY, tokenWithExp(pastExp))

    const { useSessionStore } = await import('./store')

    expect(useSessionStore.getState()).toMatchObject({ token: null, isAuthenticated: false })
    // Treated as absent, not merely reported as such -- the stale value is
    // actually cleared, so a later read of storage does not resurrect it.
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('treats a token that expires while the app is open as absent on the next window focus', async () => {
    const validAtLoad = Temporal.Instant.from('2026-09-04T12:00:00Z')
    const expiresShortlyAfter = Math.floor(validAtLoad.add({ minutes: 1 }).epochMilliseconds / 1000)
    localStorage.setItem(TOKEN_STORAGE_KEY, tokenWithExp(expiresShortlyAfter))

    const instantSpy = vi.spyOn(Temporal.Now, 'instant').mockReturnValue(validAtLoad)
    const { useSessionStore } = await import('./store')

    // Valid at load time -- proves the focus check below is a REAL
    // transition, not a token that was already treated as absent at import.
    expect(useSessionStore.getState().isAuthenticated).toBe(true)

    instantSpy.mockReturnValue(validAtLoad.add({ minutes: 5 }))
    window.dispatchEvent(new Event('focus'))

    expect(useSessionStore.getState()).toMatchObject({ token: null, isAuthenticated: false })
  })

  // tenant-from-url change (owner-approved plan, 2026-09-08): reviving the
  // dead `tenantSlug` field -- `setTenantSlug` persists it to `localStorage`
  // via the SAME try/catch discipline `persistToken` already established
  // above, so `LoginScreen` can recover it after a 401 lockout redirect to a
  // bare `/login` (D31's own resolution order's third source, after the URL
  // path and `?tenant=`).
  const TENANT_SLUG_STORAGE_KEY = 'owner-session-tenant-slug'

  it('persists a newly resolved tenant slug via setTenantSlug', async () => {
    const { useSessionStore } = await import('./store')

    useSessionStore.getState().setTenantSlug('aya')

    expect(localStorage.getItem(TENANT_SLUG_STORAGE_KEY)).toBe('aya')
    expect(useSessionStore.getState().tenantSlug).toBe('aya')
  })

  // [TRIANGULATE]: a SECOND slug, proving this is a real read/write path
  // and not a value hardcoded to the first test's own input.
  it('starts from a slug already persisted in localStorage, overriding the build-time default', async () => {
    localStorage.setItem(TENANT_SLUG_STORAGE_KEY, 'casa-del-rio')

    const { useSessionStore } = await import('./store')

    expect(useSessionStore.getState().tenantSlug).toBe('casa-del-rio')
  })

  // The lockout guard's own structural proof: `clearToken` (the 401
  // interceptor's action) must NOT wipe the persisted tenant slug -- only
  // the token identifies WHO she is; the slug identifies WHICH tenant, and
  // that fact does not become false just because her session expired.
  it('keeps the persisted tenant slug when clearToken runs', async () => {
    const { useSessionStore } = await import('./store')
    useSessionStore.getState().setTenantSlug('aya')
    useSessionStore.getState().setToken(tokenWithExp(farFutureEpochSeconds()))

    useSessionStore.getState().clearToken()

    expect(localStorage.getItem(TENANT_SLUG_STORAGE_KEY)).toBe('aya')
    expect(useSessionStore.getState().tenantSlug).toBe('aya')
  })
})
