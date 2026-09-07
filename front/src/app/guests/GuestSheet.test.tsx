import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'
import { GUEST_SHEET_COPY } from '../../shared/copy/guests'
import { parsePlainDate } from '../../shared/date/parsePlainDate'
import type { ReservationDetail } from '../reservations/useReservations'

// tasks 7.9-7.14, handoff screen 10 ("Un huésped, al tocarlo"). A guest's
// stay history: overflow collapse (7.9/7.10), tap-to-navigate (7.11/7.12),
// and the deactivate confirmation (7.13/7.14) -- reusing 7.7/7.8's own
// `summarizeGuestStays()` for the same non-cancelled filter and the same
// `check_in`-ascending sort D30 requires everywhere else, so this sheet and
// the directory row it opens from cannot disagree about which stays count.
//
// `GuestSheet` receives ALREADY-DECODED reservations as a prop -- the same
// list `GuestDirectory`'s own `useReservations()` already fetched once for
// every row's aggregate (7.7/7.8) -- rather than fetching a second time
// for the one guest whose sheet happens to be open. Fixtures here are
// built directly in that decoded shape, never as raw API JSON, because this
// component's own job starts after the decode boundary, not before it.

const ANA = 'c1111111-1111-1111-1111-111111111111'
const CASA_AZUL = 'p1111111-1111-1111-1111-111111111111'
const RESERVATION_DETAIL_STUB_TEXT = 'detalle de la reserva'

function stay(id: string, checkIn: string, checkOut: string, status = 'confirmed'): ReservationDetail {
  return {
    id,
    propertyId: CASA_AZUL,
    clientId: ANA,
    checkIn: parsePlainDate(checkIn),
    checkOut: parsePlainDate(checkOut),
    status,
    pricePerNightCentavos: null,
    priceTotalCentavos: 9000000,
    paidAmountCentavos: 0,
    effectiveTotalCentavos: 9000000,
    balanceCentavos: 9000000,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GuestSheetUnderTest: any

function renderSheet(reservations: readonly ReservationDetail[], onClose: () => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/huespedes',
        Component: () => (
          <GuestSheetUnderTest
            guest={{ id: ANA, full_name: 'Ana Activa', phone: '1122334455', email: null, national_id: null, is_active: true }}
            reservations={reservations}
            cabins={[{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]}
            onClose={onClose}
          />
        ),
      },
      { path: '/reserva/:id', Component: () => <p>{RESERVATION_DETAIL_STUB_TEXT}</p> },
    ],
    { initialEntries: ['/huespedes'] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('GuestSheet', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./GuestSheet')
    GuestSheetUnderTest = mod.GuestSheet
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // task 7.9/7.10: more non-cancelled stays than the sheet shows directly
  // collapse into "y 1 estadía más en febrero" -- the spec's own literal
  // example, count adjusted to the real overflow. Sorted by `check_in`
  // ascending (D30), so the fourth and LATEST stay -- the one that
  // overflows the 3-row visible window -- is the one in February 2027.
  it('collapses stays beyond the visible rows into one overflow line naming the earliest overflowing month', () => {
    renderSheet([
      stay('r-1', '2026-06-01', '2026-06-03'),
      stay('r-2', '2026-07-01', '2026-07-03'),
      stay('r-3', '2026-08-01', '2026-08-03'),
      stay('r-4', '2027-02-05', '2027-02-07'),
    ])

    expect(screen.getByText('y 1 estadía más en febrero')).toBeInTheDocument()
  })

  it('shows no overflow line when every non-cancelled stay fits within the visible rows', () => {
    renderSheet([stay('r-1', '2026-06-01', '2026-06-03'), stay('r-2', '2026-07-01', '2026-07-03')])

    expect(screen.queryByText(/estadía.*más en/)).not.toBeInTheDocument()
  })

  // task 7.11/7.12: tapping a listed stay row navigates to that
  // reservation's detail view -- an `<a href="/reserva/{id}">`, the same
  // navigation-proof convention `TabBar.test.tsx` already established for a
  // plain link with no guard logic behind it.
  it('links each stay row to that reservation’s own detail view', () => {
    renderSheet([stay('r-1', '2026-09-03', '2026-09-07')])

    expect(screen.getByRole('link', { name: /3 al 7 de septiembre/ })).toHaveAttribute('href', '/reserva/r-1')
  })

  // task 7.13/7.14: confirming "Desactivar" performs a soft delete and the
  // guest's past stays remain fully readable, named, afterward. Declining
  // sends nothing.
  it('sends no request when declining the deactivate confirmation', async () => {
    let deleteCount = 0
    server.use(
      http.delete(`http://localhost:8000/clients/${ANA}`, () => {
        deleteCount += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderSheet([stay('r-1', '2026-09-03', '2026-09-07')])
    await userEvent.click(screen.getByRole('button', { name: GUEST_SHEET_COPY.deactivate }))
    await screen.findByRole('dialog', { name: /Desactivás/ })
    await userEvent.click(screen.getByRole('button', { name: /No, dejarlo como está/ }))

    expect(deleteCount).toBe(0)
    // Her stay is still there, named, after declining.
    expect(screen.getByRole('link', { name: /3 al 7 de septiembre/ })).toBeInTheDocument()
  })

  it('confirms "Desactivar", performs the soft delete, and leaves past stays visible with the guest’s name intact', async () => {
    let deleteCount = 0
    server.use(
      http.delete(`http://localhost:8000/clients/${ANA}`, () => {
        deleteCount += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderSheet([stay('r-1', '2026-09-03', '2026-09-07'), stay('r-2', '2026-05-01', '2026-05-03')])
    await userEvent.click(screen.getByRole('button', { name: GUEST_SHEET_COPY.deactivate }))
    await screen.findByRole('dialog', { name: /Desactivás/ })
    await userEvent.click(screen.getByRole('button', { name: /Sí, desactivar/ }))

    await screen.findByText('Ana Activa')
    expect(deleteCount).toBe(1)
    expect(screen.getByRole('link', { name: /3 al 7 de septiembre/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1 al 3 de mayo/ })).toBeInTheDocument()
  })
})
