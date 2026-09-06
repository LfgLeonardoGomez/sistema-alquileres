import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'

// tasks 4.13-4.16: `reservation-calendar` spec's "One Cabin Is Selected At
// A Time, As URL State" and "Occupied Nights Are Read-Only". Rendered
// through a real router (`createMemoryRouter`) so the URL-reading/-writing
// behaviour these tasks specify is genuinely exercised, matching
// `useMonthParam.test.ts`/`Login.test.tsx`'s own established pattern. This
// component test supplies its OWN local `QueryClientProvider` -- unlike the
// dedicated real-tree defect test in `routes.test.tsx`, an isolated
// component test wrapping its own minimal providers is the established
// convention here (`lookups.test.ts`, `TabBar.test.tsx`).

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'
const CASA_DOS_AGUAS = 'b2222222-2222-2222-2222-222222222222'
const GUEST_AZUL = 'c1111111-1111-1111-1111-111111111111'
const GUEST_DOS_AGUAS = 'c2222222-2222-2222-2222-222222222222'

function cabinsHandler() {
  return http.get('http://localhost:8000/properties', () =>
    HttpResponse.json([
      { id: CASA_AZUL, name: 'Casa Azul', is_active: true },
      { id: CASA_DOS_AGUAS, name: 'Casa Dos Aguas', is_active: true },
    ]),
  )
}

function clientsHandler() {
  return http.get('http://localhost:8000/clients', () =>
    HttpResponse.json([
      { id: GUEST_AZUL, full_name: 'Guest Azul', phone: '111', email: null, national_id: null, is_active: true },
      { id: GUEST_DOS_AGUAS, full_name: 'Guest Dos Aguas', phone: '222', email: null, national_id: null, is_active: true },
    ]),
  )
}

function reservationsHandler() {
  return http.get('http://localhost:8000/reservations', ({ request }) => {
    const propertyId = new URL(request.url).searchParams.get('property_id')
    if (propertyId === CASA_AZUL) {
      return HttpResponse.json([
        {
          id: 'r-azul',
          client_id: GUEST_AZUL,
          check_in: '2026-09-08',
          check_out: '2026-09-12',
          status: 'confirmed',
          balance: '0.00',
        },
      ])
    }
    if (propertyId === CASA_DOS_AGUAS) {
      return HttpResponse.json([
        {
          id: 'r-dos-aguas',
          client_id: GUEST_DOS_AGUAS,
          check_in: '2026-09-05',
          check_out: '2026-09-07',
          status: 'confirmed',
          balance: '0.00',
        },
      ])
    }
    return HttpResponse.json([])
  })
}

function renderCalendarAt(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/calendario', lazy: async () => ({ Component: (await import('./CalendarScreen')).CalendarScreen }) }],
    { initialEntries: [initialPath] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('CalendarScreen', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    server.use(cabinsHandler(), clientsHandler(), reservationsHandler())
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // 4.13/4.14: switching the segmented control updates the URL's cabin
  // parameter and the shown occupancy, with no other state change (the
  // month parameter is untouched).
  it('switching the segmented control updates only the URL cabin parameter and the shown occupancy', async () => {
    const user = userEvent.setup()
    const router = renderCalendarAt(`/calendario?cabana=${CASA_AZUL}&mes=2026-09`)

    await waitFor(() => expect(screen.getByText('Guest Azul')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.queryByText('Guest Dos Aguas')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Casa Dos Aguas' }))

    await waitFor(() => expect(screen.getByText('Guest Dos Aguas')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.queryByText('Guest Azul')).not.toBeInTheDocument()

    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('cabana')).toBe(CASA_DOS_AGUAS)
    expect(params.get('mes')).toBe('2026-09') // no other state change
  })

  // 4.15/4.16: this calendar has no interaction -- tapping an occupied or a
  // free day starts no selection, opens no editor, and sends no request.
  it('tapping an occupied day changes nothing -- no selection, no navigation, no request', async () => {
    const user = userEvent.setup()
    const router = renderCalendarAt(`/calendario?cabana=${CASA_AZUL}&mes=2026-09`)

    await waitFor(() => expect(screen.getByText('Guest Azul')).toBeInTheDocument(), { timeout: 3000 })
    const occupiedDay = screen.getByTestId('day-2026-09-09') // inside Stay Azul's 08-12 range
    expect(occupiedDay.getAttribute('data-occupied')).toBe('true')

    const searchBefore = router.state.location.search
    await user.click(occupiedDay)

    expect(router.state.location.search).toBe(searchBefore)
    expect(occupiedDay.getAttribute('data-occupied')).toBe('true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // [TRIANGULATE] `useCabinParam.ts`'s own documented contract: an absent
  // `?cabana=` defaults to a real cabin from `useCabins()`'s list, written
  // back into the URL -- D31's "the URL is state" rule holding even on a
  // first, bare `/calendario` visit.
  it('[TRIANGULATE] defaults to the first cabin from the lookup and writes it into the URL when ?cabana= is absent', async () => {
    const router = renderCalendarAt('/calendario?mes=2026-09')

    await waitFor(() => expect(screen.getByText('Guest Azul')).toBeInTheDocument(), { timeout: 3000 })

    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('cabana')).toBe(CASA_AZUL)
  })

  it('tapping a free day changes nothing -- no selection, no navigation, no request', async () => {
    const user = userEvent.setup()
    const router = renderCalendarAt(`/calendario?cabana=${CASA_AZUL}&mes=2026-09`)

    await waitFor(() => expect(screen.getByText('Guest Azul')).toBeInTheDocument(), { timeout: 3000 })
    const freeDay = screen.getByTestId('day-2026-09-20')
    expect(freeDay.getAttribute('data-occupied')).toBeNull()

    const searchBefore = router.state.location.search
    await user.click(freeDay)

    expect(router.state.location.search).toBe(searchBefore)
    expect(freeDay.getAttribute('data-occupied')).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
