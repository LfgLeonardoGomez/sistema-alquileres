import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/setup'
import { CABIN_DIRECTORY_COPY, CABIN_EDIT_SHEET_COPY, CABIN_FORM_COPY, DEACTIVATE_CABIN_SHEET_COPY } from '../../shared/copy/cabins'

// task 8.1-8.10, `cabin-directory` spec: handoff screen 08 ("Cabañas").
// `useCabins()` (4.9) is the app's ONE lookup call site for `/properties`
// and already fetches `include_inactive=true` (D30) -- this screen's own
// job, on `GuestDirectory.tsx`'s own precedent, is presentation and the two
// cabin-scoped writes (rename, deactivate) only.

const CASA_AZUL = 'cab-1111-1111-1111-111111111111'
const CASA_DOS_AGUAS = 'cab-2222-2222-2222-222222222222'

type CabinFixture = { id: string; name: string; is_active: boolean }

// A mutable fixture, not a frozen literal -- the deactivate/rename flows
// this file exercises must be observable on the NEXT fetch after the
// mutation's own `onSettled` invalidates `keys.cabins()`, the same
// mutable-fixture-plus-live-handler shape `GuestDirectory.test.tsx`'s own
// reactivation test uses for the identical reason.
function cabinsHandler(cabins: CabinFixture[]) {
  return http.get('http://localhost:8000/properties', ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('include_inactive') !== 'true') {
      return HttpResponse.json(cabins.filter((cabin) => cabin.is_active))
    }
    return HttpResponse.json(cabins)
  })
}

function deactivateHandler(cabins: CabinFixture[], onDelete: () => void) {
  return http.delete('http://localhost:8000/properties/:id', ({ params }) => {
    onDelete()
    const cabin = cabins.find((candidate) => candidate.id === params.id)
    if (cabin !== undefined) cabin.is_active = false
    return new HttpResponse(null, { status: 204 })
  })
}

function renameHandler(cabins: CabinFixture[]) {
  return http.patch('http://localhost:8000/properties/:id', async ({ params, request }) => {
    const body = (await request.json()) as { name: string }
    const cabin = cabins.find((candidate) => candidate.id === params.id)
    if (cabin !== undefined) cabin.name = body.name
    return HttpResponse.json({ id: params.id, name: body.name, created_at: '2026-01-01T00:00:00Z', is_active: cabin?.is_active ?? true })
  })
}

function dashboardHandler(properties: readonly { property_id: string; occupied_nights: number; available_nights: number }[] = []) {
  return http.get('http://localhost:8000/dashboard/summary', () =>
    HttpResponse.json({ collected: '0.00', occupied_nights: 0, available_nights: 0, properties }),
  )
}

function reservationsHandler(reservations: readonly Record<string, unknown>[] = []) {
  return http.get('http://localhost:8000/reservations/:id', () => HttpResponse.json(reservations[0] ?? null))
}

// Moved from `HomeScreen.test.tsx` (2026-09-07) alongside the same
// `mockTodayAt` idiom that file's own trap test established, for the
// reason recorded on the test using this below.
function mockTodayAt(instant: string) {
  return vi
    .spyOn(Temporal.Now, 'plainDateISO')
    .mockImplementation((timeZone) => Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone ?? 'UTC').toPlainDate())
}

function renderDirectory(queryClient: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const router = createMemoryRouter([{ path: '/cabanas', Component: CabinDirectoryUnderTest }], {
    initialEntries: ['/cabanas'],
  })
  return { ...render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  ), queryClient }
}

// task 8.7/8.8's own trap needs a SECOND, SEPARATELY mounted screen that
// reads `useCabins()` off the exact same `QueryClient` as `CabinDirectory`
// -- proving the renamed cabin's name propagates without either screen
// knowing about the other, D31's "resolved live, never snapshotted" claim
// made observable across a real screen boundary rather than just within
// `CabinDirectory` itself. A second, independent `render()` sharing one
// `QueryClient` (rather than a two-route single router) keeps this
// deliberately simple: nothing here depends on React Router's own
// lazy-loading/navigation timing, only on TanStack Query's cache.
function renderReservationDetail(queryClient: QueryClient, reservationId: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/reserva/:id',
        lazy: async () => {
          const { ReservationDetail } = await import('../reservations/detail/ReservationDetail')
          return { Component: ReservationDetail }
        },
      },
    ],
    { initialEntries: [`/reserva/${reservationId}`] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CabinDirectoryUnderTest: any

describe('CabinDirectory', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./CabinDirectory')
    CabinDirectoryUnderTest = mod.CabinDirectory
    server.use(dashboardHandler(), reservationsHandler())
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
    vi.restoreAllMocks()
  })

  // task 8.1, the spec's own "Cabins Are Never Deleted, Only Deactivated"
  // requirement, both scenarios asserted together (the second is what makes
  // the first a real guarantee rather than a coincidence of this fixture):
  // no rendered control anywhere on the screen reads as a permanent delete,
  // and deactivating a cabin leaves it visible and named afterward --
  // deactivating is never mistaken, structurally, for deleting.
  it('never offers a permanent-delete action, and deactivating a cabin keeps it visible and named', async () => {
    const cabins: CabinFixture[] = [
      { id: CASA_AZUL, name: 'Casa Azul', is_active: true },
      { id: CASA_DOS_AGUAS, name: 'Casa Dos Aguas', is_active: true },
    ]
    let deleteRequestCount = 0
    server.use(cabinsHandler(cabins), deactivateHandler(cabins, () => (deleteRequestCount += 1)))

    renderDirectory()
    await screen.findByText('Casa Azul')

    // No button or link anywhere on the screen names a permanent-delete
    // action -- checked against every control, not merely the ones this
    // fixture happens to exercise, so a future addition can't slip a
    // delete affordance in unnoticed.
    const controls = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')]
    for (const control of controls) {
      expect(control.textContent ?? '').not.toMatch(/eliminar|borrar/i)
    }

    await userEvent.click(within(screen.getByText('Casa Azul').closest('li')!).getByRole('button', { name: CABIN_DIRECTORY_COPY.edit }))
    await userEvent.click(screen.getByRole('button', { name: CABIN_EDIT_SHEET_COPY.deactivate }))
    await userEvent.click(screen.getByRole('button', { name: DEACTIVATE_CABIN_SHEET_COPY.confirm }))

    expect(deleteRequestCount).toBe(1)
    // Still visible, still named -- a soft delete, never a vanished row.
    expect(await screen.findByText('Casa Azul')).toBeInTheDocument()
  })

  // task 8.3, the spec's own "Deactivating Requires Confirmation" scenario:
  // declining sends no request and the cabin remains active. Asserted
  // against the REAL captured `DELETE` count, `GuestForm.test.tsx`'s own
  // established convention -- "no request MUST be sent" is proven at the
  // network boundary, not merely by a callback spy a guard could bypass.
  it('sends no request and leaves the cabin active when the deactivation confirmation is declined', async () => {
    const cabins: CabinFixture[] = [{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]
    let deleteRequestCount = 0
    server.use(cabinsHandler(cabins), deactivateHandler(cabins, () => (deleteRequestCount += 1)))

    renderDirectory()
    await screen.findByText('Casa Azul')

    await userEvent.click(within(screen.getByText('Casa Azul').closest('li')!).getByRole('button', { name: CABIN_DIRECTORY_COPY.edit }))
    await userEvent.click(screen.getByRole('button', { name: CABIN_EDIT_SHEET_COPY.deactivate }))
    await userEvent.click(screen.getByRole('button', { name: DEACTIVATE_CABIN_SHEET_COPY.decline }))

    expect(deleteRequestCount).toBe(0)
    expect(screen.getByText('Casa Azul').closest('li')).not.toHaveAttribute('data-tone', 'muted')
  })

  // task 8.7/8.8 [TRAP], the spec's own "Renaming Propagates Everywhere The
  // Name Is Shown, Without Migrating History" requirement: renaming a
  // cabin shown on a PAST reservation's detail view updates that
  // reservation's displayed name too, with no migration step anywhere in
  // this flow. Two screens, one shared `QueryClient`, neither aware of the
  // other -- `ReservationDetail.tsx` resolves `cabinName` live via
  // `useCabins()` (never a snapshot on the reservation record itself), so
  // this is the direct, cross-screen proof of that claim, not a unit test
  // of `useCabins()` in isolation.
  it('[TRAP] propagates a cabin rename to a past reservation’s detail view, with no migration step', async () => {
    const cabins: CabinFixture[] = [{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]
    server.use(
      cabinsHandler(cabins),
      renameHandler(cabins),
      http.get('http://localhost:8000/clients', () => HttpResponse.json([])),
      http.get('http://localhost:8000/reservations/:id', () =>
        HttpResponse.json({
          id: 'res-1',
          property_id: CASA_AZUL,
          client_id: 'cli-1',
          check_in: '2026-01-03',
          check_out: '2026-01-07',
          status: 'confirmed',
          price_per_night: null,
          price_total: '180000.00',
          paid_amount: '180000.00',
          effective_total: '180000.00',
          balance: '0.00',
        }),
      ),
      http.get('http://localhost:8000/reservations/:id/payments', () => HttpResponse.json([])),
    )

    const { queryClient, unmount } = renderDirectory()
    await screen.findByText('Casa Azul')

    await userEvent.click(within(screen.getByText('Casa Azul').closest('li')!).getByRole('button', { name: CABIN_DIRECTORY_COPY.edit }))
    const nameInput = screen.getByLabelText(CABIN_FORM_COPY.nameLabel)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Casa Renombrada')
    await userEvent.click(screen.getByRole('button', { name: CABIN_FORM_COPY.renameSubmit }))
    await screen.findByText('Casa Renombrada')

    unmount()
    renderReservationDetail(queryClient, 'res-1')

    // The renamed name reaches the past reservation's detail view with NO
    // migration step: nothing in this test ever touched `res-1`'s own
    // record, and no code under test does either -- `renameHandler` only
    // mutates the `cabins` fixture array.
    expect(await screen.findByText('Casa Renombrada')).toBeInTheDocument()
    expect(screen.queryByText('Casa Azul')).not.toBeInTheDocument()
  })

  // task 8.9/8.10, the spec's own "Occupied-Nights-This-Month Reuses The
  // Dashboard's Per-Property Breakdown" requirement, and its own literal
  // fixture: `GET /dashboard/summary` reports `9` for a cabin's property
  // id, and the card must show "9 noches ocupadas este mes" -- SOURCED
  // FROM THAT RESPONSE, not a client-side recount. Pinned by NOT mocking
  // any reservations-list endpoint at all: a client-recomputed
  // implementation would have nothing to count from and could only ever
  // show `0`, so this fixture cannot pass by accident -- the `9` can only
  // have come from the dashboard response.
  it('shows the occupied-nights figure straight from the dashboard response, never a client-side recount', async () => {
    server.use(
      cabinsHandler([{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]),
      dashboardHandler([{ property_id: CASA_AZUL, occupied_nights: 9, available_nights: 21 }]),
    )

    renderDirectory()

    expect(await screen.findByText('9 noches ocupadas este mes')).toBeInTheDocument()
  })

  // [TRAP] moved from `HomeScreen.test.tsx` (2026-09-07): the home-summary
  // spec's own "Occupied-Nights Progress Reflects The Argentina-Time
  // Month" requirement was superseded on Home when the owner replaced its
  // occupancy card with "Próximas llegadas" (`openspec/changes/
  // cabin-booking-frontend/specs/home-summary/spec.md` records the
  // supersession). The underlying claim -- that a `/dashboard/summary`
  // window is computed in Argentina time, not UTC -- did not stop being
  // true, it moved: this screen's own occupied-nights-this-month figure
  // (task 8.9/8.10, `useDashboardSummary.ts`) is the last surviving
  // caller of that window, so its trap now lives here. At
  // `2026-10-01T02:00:00Z` it is still `2026-09-30T23:00` in Argentina --
  // a naive browser-local/UTC reading would request October instead of
  // September.
  it('[TRAP] requests the Argentina-time month window near a UTC rollover, not the UTC month', async () => {
    mockTodayAt('2026-10-01T02:00:00Z')
    let requestedUrl: URL | undefined
    server.use(
      cabinsHandler([{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]),
      http.get('http://localhost:8000/dashboard/summary', ({ request }) => {
        requestedUrl = new URL(request.url)
        return HttpResponse.json({
          collected: '0.00',
          occupied_nights: 9,
          available_nights: 21,
          properties: [{ property_id: CASA_AZUL, occupied_nights: 9, available_nights: 21 }],
        })
      }),
    )

    renderDirectory()

    expect(await screen.findByText('9 noches ocupadas este mes')).toBeInTheDocument()
    expect(requestedUrl?.searchParams.get('from')).toBe('2026-09-01')
    expect(requestedUrl?.searchParams.get('to')).toBe('2026-10-01')
  })
})
