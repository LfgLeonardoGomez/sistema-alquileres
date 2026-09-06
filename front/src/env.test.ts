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
})
