import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'

// task 4.14's incidental plumbing (see the hook's own module doc): the
// calendar screen's per-cabin, COMPLETE stay-list fetch, decoding
// `check_in`/`check_out` into `PlainDate` and `balance` into integer
// centavos at this one boundary (D27/D35), matching `lookups.test.ts`'s own
// dynamic-import discipline (transitively imports `client.ts` -> `env.ts`).

function renderQueryHook<T>(useHook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return renderHook(useHook, { wrapper })
}

describe('useReservationsForCabin', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('fetches the complete stay list for one cabin via property_id, with no date window', async () => {
    let capturedUrl: URL | null = null
    server.use(
      http.get('http://localhost:8000/reservations', ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json([])
      }),
    )

    const { useReservationsForCabin } = await import('./useReservationsForCabin')
    const { result } = renderQueryHook(() => useReservationsForCabin('cabin-a'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(capturedUrl).not.toBeNull()
    expect(capturedUrl!.searchParams.get('property_id')).toBe('cabin-a')
    expect(capturedUrl!.searchParams.has('from')).toBe(false)
    expect(capturedUrl!.searchParams.has('to')).toBe(false)
  })

  it('decodes check_in/check_out into PlainDate and balance into integer centavos', async () => {
    server.use(
      http.get('http://localhost:8000/reservations', () =>
        HttpResponse.json([
          {
            id: 'r-1',
            client_id: 'c-1',
            check_in: '2026-09-03',
            check_out: '2026-09-07',
            status: 'confirmed',
            balance: '80000.00',
          },
        ]),
      ),
    )

    const { useReservationsForCabin } = await import('./useReservationsForCabin')
    const { result } = renderQueryHook(() => useReservationsForCabin('cabin-a'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([
      {
        id: 'r-1',
        clientId: 'c-1',
        checkIn: '2026-09-03',
        checkOut: '2026-09-07',
        status: 'confirmed',
        balanceCentavos: 8000000,
      },
    ])
  })

  it('does not fetch at all when no cabin is selected', async () => {
    const { useReservationsForCabin } = await import('./useReservationsForCabin')
    const { result } = renderQueryHook(() => useReservationsForCabin(null))
    expect(result.current.fetchStatus).toBe('idle')
  })
})
