import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'
import { GUEST_DIRECTORY_COPY, GUESTS_COPY } from '../../shared/copy/guests'

// task 7.1-7.8, `guest-directory` spec: screen 09 ("Huéspedes"). Deactivated
// guests are visible BY DESIGN (D30's own carve-out: "the one exception is a
// guest's stay history"), never filtered out of the fetched-with-
// `include_inactive=true` list `useClients()` (4.9/4.10) already provides --
// this screen's own job is purely how a deactivated row is PRESENTED, never
// whether it is present at all.

const ANA = 'c1111111-1111-1111-1111-111111111111'
const JUAN = 'c2222222-2222-2222-2222-222222222222'

type ClientFixture = {
  readonly id: string
  readonly full_name: string
  readonly phone: string
  readonly is_active: boolean
}

function clientsHandler(clients: readonly ClientFixture[]) {
  return http.get('http://localhost:8000/clients', () =>
    HttpResponse.json(clients.map((client) => ({ ...client, email: null, national_id: null }))),
  )
}

function reservationsHandler(reservations: readonly Record<string, unknown>[] = []) {
  return http.get('http://localhost:8000/reservations', () => HttpResponse.json(reservations))
}

function cabinsHandler() {
  return http.get('http://localhost:8000/properties', () => HttpResponse.json([]))
}

function renderDirectory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/huespedes', Component: GuestDirectoryUnderTest }], {
    initialEntries: ['/huespedes'],
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GuestDirectoryUnderTest: any

describe('GuestDirectory', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./GuestDirectory')
    GuestDirectoryUnderTest = mod.GuestDirectory
    server.use(cabinsHandler(), reservationsHandler())
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // task 7.1: a deactivated client still appears, styled grey and marked
  // "Desactivado" -- never filtered out. Asserted as a pair, same shape as
  // 6.16's "present AND absent" precedent: the active guest must ALSO
  // render, plainly, with none of the inactive row's markers, so the test
  // cannot pass by rendering nothing or by rendering every row identically.
  it('lists a deactivated guest, marked grey and "Desactivado", alongside an active one shown plainly', async () => {
    server.use(
      clientsHandler([
        { id: ANA, full_name: 'Ana Activa', phone: '1122334455', is_active: true },
        { id: JUAN, full_name: 'Juan Inactivo', phone: '1155667788', is_active: false },
      ]),
    )

    renderDirectory()

    const anaRow = (await screen.findByText('Ana Activa')).closest('li')
    const juanRow = screen.getByText('Juan Inactivo').closest('li')

    expect(anaRow).not.toBeNull()
    expect(juanRow).not.toBeNull()
    expect(anaRow).not.toHaveAttribute('data-tone', 'muted')
    expect(juanRow).toHaveAttribute('data-tone', 'muted')

    expect(juanRow).toHaveTextContent(GUEST_DIRECTORY_COPY.inactiveTag)
    expect(anaRow).not.toHaveTextContent(GUEST_DIRECTORY_COPY.inactiveTag)
  })

  // task 7.3/7.4: adding a guest whose phone matches an existing ACTIVE
  // client resolves to that client -- no duplicate `POST /clients`, and no
  // second row. Mounted from the "Agregar un huésped" button, a SECOND
  // entry point onto 5.17/5.19's own find-or-create-or-reactivate call
  // (`useFindOrCreateGuest`), reused rather than reimplemented: this test
  // exists to prove that reuse holds through a new call site, not to
  // re-prove the 200-vs-201 branch itself (5.16-5.19 already do).
  it('resolves an existing active guest by phone through the add-guest sheet, creating no duplicate', async () => {
    server.use(clientsHandler([{ id: ANA, full_name: 'Ana Activa', phone: '1122334455', is_active: true }]))
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/clients', () => {
        requestCount += 1
        return HttpResponse.json(
          { id: ANA, full_name: 'Ana Activa', phone: '1122334455', email: null, national_id: null, is_active: true },
          { status: 200 },
        )
      }),
    )

    renderDirectory()
    await screen.findByText('Ana Activa')

    await userEvent.click(screen.getByRole('button', { name: GUEST_DIRECTORY_COPY.addGuest }))
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.phoneLabel), '1122334455')
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Ana Activa')
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.search }))

    await screen.findByText(GUESTS_COPY.seguir)
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.seguir }))

    expect(requestCount).toBe(1)
    // Exactly one "Ana Activa" left once the sheet closes -- resolving did
    // not create a second client.
    expect(screen.getAllByText('Ana Activa')).toHaveLength(1)
  })

  // task 7.3: a DEACTIVATED client's matching phone reactivates it rather
  // than creating a duplicate. `useFindOrCreateGuest`'s own `onSuccess`
  // (5.17) invalidates `keys.clients()`, so the refetched list is what
  // proves reactivation here -- the same 200 status D8 returns for "already
  // active" and "just reactivated" (GuestStep.test.tsx's own honest limit).
  it('reactivates a deactivated guest by phone through the add-guest sheet, and the list drops the "Desactivado" mark', async () => {
    let reactivated = false
    server.use(
      http.get('http://localhost:8000/clients', () =>
        HttpResponse.json([
          {
            id: JUAN,
            full_name: 'Juan Inactivo',
            phone: '1155667788',
            email: null,
            national_id: null,
            is_active: !reactivated ? false : true,
          },
        ]),
      ),
      http.post('http://localhost:8000/clients', () => {
        reactivated = true
        return HttpResponse.json(
          { id: JUAN, full_name: 'Juan Inactivo', phone: '1155667788', email: null, national_id: null, is_active: true },
          { status: 200 },
        )
      }),
    )

    renderDirectory()
    const firstRow = (await screen.findByText('Juan Inactivo')).closest('li')
    expect(firstRow).toHaveAttribute('data-tone', 'muted')

    await userEvent.click(screen.getByRole('button', { name: GUEST_DIRECTORY_COPY.addGuest }))
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.phoneLabel), '1155667788')
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Juan Inactivo')
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.search }))
    await screen.findByText(GUESTS_COPY.seguir)
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.seguir }))

    await screen.findByText('Juan Inactivo')
    const rowAfter = screen.getByText('Juan Inactivo').closest('li')
    expect(rowAfter).not.toHaveAttribute('data-tone', 'muted')
    expect(screen.getAllByText('Juan Inactivo')).toHaveLength(1)
  })

  // task 7.5/7.6: typing into "Buscar por nombre o teléfono" filters the
  // already-fetched list, client-side, to rows whose name OR phone contains
  // the typed text. The spec's own literal fixture: `2233` narrows
  // `1122334455`/`1155667788` to only the first.
  it('filters the visible rows by a typed phone substring', async () => {
    server.use(
      clientsHandler([
        { id: ANA, full_name: 'Ana Activa', phone: '1122334455', is_active: true },
        { id: JUAN, full_name: 'Juan Inactivo', phone: '1155667788', is_active: false },
      ]),
    )

    renderDirectory()
    await screen.findByText('Ana Activa')
    screen.getByText('Juan Inactivo')

    await userEvent.type(screen.getByLabelText(GUEST_DIRECTORY_COPY.searchLabel), '2233')

    expect(screen.getByText('Ana Activa')).toBeInTheDocument()
    expect(screen.queryByText('Juan Inactivo')).not.toBeInTheDocument()
  })

  // task 7.7/7.8, the spec's own literal fixture: a guest with one
  // non-cancelled stay (balance 80000) and one cancelled stay shows "Debe $
  // 80.000", excluding the cancelled amount; with two non-cancelled and one
  // cancelled stay, the count reads "2 estadías". Both written together, on
  // 6.24's own precedent -- the second half is what makes the first a RULE
  // (cancelled stays excluded) rather than a sum that happens to be right.
  it("shows a guest's combined balance and stay count, excluding cancelled stays", async () => {
    server.use(
      clientsHandler([{ id: ANA, full_name: 'Ana Activa', phone: '1122334455', is_active: true }]),
      reservationsHandler([
        // Non-cancelled #1: owes 80000.
        { id: 'r-1', client_id: ANA, property_id: 'p-1', check_in: '2026-09-03', check_out: '2026-09-07', status: 'confirmed', price_per_night: null, price_total: '180000.00', paid_amount: '100000.00', effective_total: '180000.00', balance: '80000.00' },
        // Non-cancelled #2: fully paid, contributes 0 to the sum but still
        // counts toward the stay count -- this is what makes "2 estadías"
        // a real count rather than a byproduct of the balance fixture.
        { id: 'r-2', client_id: ANA, property_id: 'p-1', check_in: '2026-07-01', check_out: '2026-07-04', status: 'confirmed', price_per_night: null, price_total: '90000.00', paid_amount: '90000.00', effective_total: '90000.00', balance: '0.00' },
        // Cancelled: a real, non-zero amount that must be excluded from both.
        { id: 'r-3', client_id: ANA, property_id: 'p-1', check_in: '2026-08-01', check_out: '2026-08-03', status: 'cancelled', price_per_night: null, price_total: '50000.00', paid_amount: '0.00', effective_total: '50000.00', balance: '50000.00' },
      ]),
    )

    renderDirectory()

    expect(await screen.findByText('Debe $ 80.000')).toBeInTheDocument()
    expect(screen.getByText('2 estadías')).toBeInTheDocument()
  })
})
