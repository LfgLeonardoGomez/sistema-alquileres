import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parsePlainDate } from '../shared/date/parsePlainDate'
import { NETWORK_FAILURE_STATUS } from '../shared/errors/normalise'
import { server } from '../test/setup'

// design D25/D31: `src/public/api.ts` is the public route tree's OWN fetch,
// structurally separate from `app/api/client.ts` (1.24) -- see the module
// comment there and in `./api.ts`. This proves the header is absent even
// with a valid token sitting in storage from a concurrent authenticated
// session in the same browser (task 2.18) -- the real scenario, not a
// hypothetical: nothing stops the owner from having the app open in one tab
// and opening her own public link in another.

describe('getPublicAvailability', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    localStorage.clear()
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    localStorage.clear()
  })

  it('sends no Authorization header, even with a valid token sitting in localStorage from a concurrent authenticated session', async () => {
    localStorage.setItem('alquileres-aya:token', 'a.valid.jwt-token-left-by-another-tab')

    let capturedAuthorization: string | null = 'not-captured'
    server.use(
      http.get('http://localhost:8000/public/:slug/availability', ({ request }) => {
        capturedAuthorization = request.headers.get('Authorization')
        return HttpResponse.json([])
      }),
    )

    const { getPublicAvailability } = await import('./api')

    await getPublicAvailability('mar-del-tuyu-cabins', {
      from: parsePlainDate('2026-09-01'),
      to: parsePlainDate('2026-10-01'),
    })

    expect(capturedAuthorization).toBeNull()
  })

  // Triangulates against a genuinely different scenario: a decoded success
  // response, proving the module does more than merely omit a header --
  // it round-trips the API's raw check_in/check_out strings into branded
  // `PlainDate`s, the same decode discipline design D26 requires everywhere.
  it('decodes a successful response into PlainDate-branded occupied ranges', async () => {
    server.use(
      http.get('http://localhost:8000/public/:slug/availability', () =>
        HttpResponse.json([
          {
            property_id: 'a1111111-1111-1111-1111-111111111111',
            name: 'Casa Azul',
            occupied: [{ check_in: '2026-09-10', check_out: '2026-09-12' }],
          },
        ]),
      ),
    )

    const { getPublicAvailability } = await import('./api')

    const result = await getPublicAvailability('mar-del-tuyu-cabins', {
      from: parsePlainDate('2026-09-01'),
      to: parsePlainDate('2026-10-01'),
    })

    expect(result).toEqual([
      {
        propertyId: 'a1111111-1111-1111-1111-111111111111',
        name: 'Casa Azul',
        occupied: [{ checkIn: '2026-09-10', checkOut: '2026-09-12' }],
      },
    ])
  })

  // A second triangulation: a network failure (no response body at all)
  // normalises through the same `shared/errors/normalise` (1.19) the
  // authenticated client uses -- design D32's "the public tree needs its
  // own failure copy" reads as reusing the shared normaliser, not writing a
  // second one.
  it('normalises a network failure the same way the authenticated client does', async () => {
    server.use(http.get('http://localhost:8000/public/:slug/availability', () => HttpResponse.error()))

    const { getPublicAvailability } = await import('./api')

    await expect(
      getPublicAvailability('mar-del-tuyu-cabins', {
        from: parsePlainDate('2026-09-01'),
        to: parsePlainDate('2026-10-01'),
      }),
    ).rejects.toEqual({ status: NETWORK_FAILURE_STATUS, code: null })
  })
})
