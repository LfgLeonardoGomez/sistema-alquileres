import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The frontend analogue of "the app refuses to boot without JWT_SECRET"
// (design D37): env.ts validates VITE_API_BASE_URL and VITE_TENANT_SLUG at
// module load, with no default for either, and throws naming whichever is
// missing. VITE_WHATSAPP_NUMBER is optional.

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

  it('does not throw, and exposes all three values, when configured', async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    import.meta.env.VITE_WHATSAPP_NUMBER = '5492215551234'

    const { env } = await import('./env')

    expect(env.apiBaseUrl).toBe('http://localhost:8000')
    expect(env.tenantSlug).toBe('mar-del-tuyu-cabins')
    expect(env.whatsappNumber).toBe('5492215551234')
  })
})
