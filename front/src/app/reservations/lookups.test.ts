import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'

// design D30: "One hook each for cabins and guests, both fetching with
// include_inactive=true. A test asserts no other module calls /properties
// or /clients for a lookup. Without this, a deactivated guest's stays
// render nameless and screen 09 -- which shows deactivated guests BY
// DESIGN -- breaks." Both hooks are dynamically imported (matching
// `env.test.ts`/`client.test.ts`'s own discipline): they transitively
// import `app/api/client.ts`, which reads `env.ts` at module load.

// task 4.10: static regression guard, labelled [TEST] not [RED] -- this
// pair of hooks is the only source of `/properties`/`/clients` calls at
// the moment this guard is written, so it cannot fail yet, matching the
// backend's own equivalent rule (only `useCabins`/`useClients` may fetch
// these lookups). The regex requires an actual `apiRequest(...)` call
// naming the path, not a bare string occurrence -- otherwise `schema.gen.ts`'s
// own `"/properties"`/`"/clients"` OpenAPI path keys (type-level
// documentation, never a runtime call) would false-positive the scan.
//
// **Corrected at task 7.14, the exact same shape as 1.22's glossary fix:**
// the boundary used to be `\b`, which matches immediately after
// "properties"/"clients" -- including right before a `/`, so
// `apiRequest(\`/clients/${guestId}\`, { method: 'DELETE' })`
// (`useDeactivateGuest.ts`, a write to ONE guest by id, never a lookup
// list) false-positived as a second lookup call site. The rule this guard
// exists to enforce is about the LIST fetch specifically (D30: "one hook
// each... fetching with include_inactive=true"), not about every request
// whose path happens to start with the same resource name. The lookahead
// below requires the path to END right there (a query string or the
// closing quote) -- a nested `/id` segment no longer matches.
const LOOKUP_CALL_SITE = /apiRequest(?:<[^>]*>)?\(\s*[`'"][^`'"]*\/(?:properties|clients)(?=[?'"`])/

// task 8.2, a real discovery made by actually running this guard against
// the new cabin-directory code, not a guessed exemption: `useAddCabin.ts`
// (`POST /properties`, no id, no query string) false-positives this regex
// for exactly the reason 7.14's own note already flagged for the OTHER
// direction -- the boundary this pattern checks is "does the path end
// right after `properties`/`clients`", which is true of a bare-resource
// CREATE just as much as it is of the LIST fetch this guard actually
// exists to police (D30: "one hook each... fetching with
// include_inactive=true"). `useFindOrCreateGuest.ts`'s own `POST /clients`
// escapes this same regex by calling `apiRequestWithStatus`, a different
// function name the pattern doesn't match -- an accident of that call
// needing the status code, not a deliberate dodge, and not a shape
// `useAddCabin.ts` has any reason to imitate (creating a cabin never needs
// the 200-vs-201 distinction `useFindOrCreateGuest.ts` decodes). An
// explicit allowlist entry, not a regex change, keeps the guard strict
// everywhere else a real second lookup site could still appear.
const ALLOWED_LOOKUP_MODULES = ['./useCabins.ts', './useClients.ts', '../cabins/useAddCabin.ts']

const appModulesForLookupGuard = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function isLookupGuardExempt(path: string): boolean {
  return path.includes('.test.') || path.includes('/test/') || ALLOWED_LOOKUP_MODULES.includes(path)
}

function renderQueryHook<T>(useHook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return renderHook(useHook, { wrapper })
}

describe('useCabins / useClients', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('useCabins fetches /properties with include_inactive=true', async () => {
    let capturedUrl: URL | null = null
    server.use(
      http.get('http://localhost:8000/properties', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json([])
      }),
    )

    const { useCabins } = await import('./useCabins')
    const { result } = renderQueryHook(useCabins)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(capturedUrl).not.toBeNull()
    expect(capturedUrl!.searchParams.get('include_inactive')).toBe('true')
  })

  it('useClients fetches /clients with include_inactive=true', async () => {
    let capturedUrl: URL | null = null
    server.use(
      http.get('http://localhost:8000/clients', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json([])
      }),
    )

    const { useClients } = await import('./useClients')
    const { result } = renderQueryHook(useClients)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(capturedUrl).not.toBeNull()
    expect(capturedUrl!.searchParams.get('include_inactive')).toBe('true')
  })

  // [TRIANGULATE] a deactivated cabin/client MUST still come back through
  // this hook (the whole point of include_inactive=true) -- not merely
  // that the query string is right, but that the response round-trips.
  it('[TRIANGULATE] a deactivated cabin still comes back through useCabins', async () => {
    server.use(
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([
          { id: 'a1111111-1111-1111-1111-111111111111', name: 'Casa Azul', created_at: '2026-01-01T00:00:00Z', is_active: false },
        ]),
      ),
    )

    const { useCabins } = await import('./useCabins')
    const { result } = renderQueryHook(useCabins)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([
      { id: 'a1111111-1111-1111-1111-111111111111', name: 'Casa Azul', created_at: '2026-01-01T00:00:00Z', is_active: false },
    ])
  })
})

describe('lookup call-site guard', () => {
  it('no module other than useCabins.ts/useClients.ts calls /properties or /clients', () => {
    const offenders = Object.entries(appModulesForLookupGuard)
      .filter(([path]) => !isLookupGuardExempt(path))
      .filter(([, contents]) => LOOKUP_CALL_SITE.test(contents as string))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })

  // Not a tautology: proves the scan itself can see and flag a real
  // lookup call site, and that it does NOT false-positive on
  // `schema.gen.ts`'s own path-key strings (the same proof pattern as
  // 1.22/1.25/2.17/4.7).
  it('the regex used above detects a real call and ignores a bare path-key string', () => {
    expect(LOOKUP_CALL_SITE.test("apiRequest('/properties?include_inactive=true')")).toBe(true)
    expect(LOOKUP_CALL_SITE.test('apiRequest<Client[]>(`/clients?include_inactive=true`)')).toBe(true)
    expect(LOOKUP_CALL_SITE.test('"/properties": { get: operations["list_properties"] }')).toBe(false)
  })

  // task 7.14's own correction, proved rather than merely stated: a write
  // to ONE resource by id (never the list) must NOT match, even though its
  // path starts with the same resource name the lookup hooks use.
  it('the regex does not flag a by-id write to /clients/{id} as a lookup call site', () => {
    expect(LOOKUP_CALL_SITE.test("apiRequest<void>(`/clients/${guestId}`, { method: 'DELETE' })")).toBe(false)
  })
})
