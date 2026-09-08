import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The frontend analogue of "the app refuses to boot without JWT_SECRET"
// (design D37): env.ts validates VITE_API_BASE_URL and VITE_TENANT_SLUG at
// module load, with no default for either, and throws naming whichever is
// missing. The build-time WhatsApp number env var this file used to test
// is deleted entirely (task 2.39, the Phase 2 addendum's gap 2): the
// number is per-tenant, from `GET /public/{slug}/contact`, never a
// build-time global -- a build-time fallback would print one tenant's
// number on another tenant's page.

describe('env', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(import.meta.env)) {
      if (key.startsWith('VITE_')) delete (import.meta.env as Record<string, unknown>)[key]
    }
  })

  afterEach(() => {
    for (const key of Object.keys(import.meta.env)) {
      if (key.startsWith('VITE_') && !(key in originalEnv)) {
        delete (import.meta.env as Record<string, unknown>)[key]
      }
    }
    Object.assign(import.meta.env, originalEnv)
  })

  it('throws naming VITE_API_BASE_URL when it is unset', async () => {
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'

    await expect(import('./env')).rejects.toThrow(/VITE_API_BASE_URL/)
  })

  it('does not throw, and exposes both values, when configured', async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'

    const { env } = await import('./env')

    expect(env.apiBaseUrl).toBe('http://localhost:8000')
    expect(env.tenantSlug).toBe('mar-del-tuyu-cabins')
  })

  // Task 2.39: the deleted build-time WhatsApp number no longer exists on
  // `env` at all -- not `undefined`, not an empty string, absent as a key.
  // `in` (not a truthiness check) so a future accidental re-addition with
  // a falsy value would still fail this test.
  it('no longer exposes a whatsappNumber field', async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'

    const { env } = await import('./env')

    expect('whatsappNumber' in env).toBe(false)
  })

  // tenant-from-url change (owner-approved plan, 2026-09-08): the tenant now
  // resolves at runtime from the URL (`/login/:slug`, `?tenant=`) and from
  // the persisted slug in `useSessionStore` -- `VITE_TENANT_SLUG` is only
  // the last-resort fallback, so a build with no such var configured must
  // still boot. `VITE_API_BASE_URL` is deliberately UNCHANGED (still
  // required, still throws) -- only the tenant slug's requirement relaxes.
  it('does not throw when VITE_TENANT_SLUG is unset, unlike VITE_API_BASE_URL', async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'

    await expect(import('./env')).resolves.toBeDefined()
  })

  // [TRIANGULATE]: the fallback value itself, not merely "did not throw" --
  // an empty string, the same "no fabricated default" discipline D37 already
  // applies to a configured value (never a fake slug like `'demo'`, which
  // would silently point a fresh build at someone else's tenant).
  it('exposes an empty string tenantSlug when VITE_TENANT_SLUG is unset', async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'

    const { env } = await import('./env')

    expect(env.tenantSlug).toBe('')
  })
})
