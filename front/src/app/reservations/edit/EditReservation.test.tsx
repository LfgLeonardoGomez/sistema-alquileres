import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'

// tasks 6.16-6.31, `reservation-ledger` spec's "Editing Bounds Itself To
// Dates And Price Only", "The Edit Calendar Excludes The Reservation Being
// Edited From Its Own Occupied Display", "Editing Rescales Or Preserves
// Price Identically To Recording", "Lowering An Edited Price Below What Has
// Been Paid Is Allowed" and "A Conflicting Date Edit Fails Visibly, Naming
// Which Nights Are Free" -- design D34.
//
// Rendered through a real router carrying BOTH `/reserva/:id/editar` and
// `/reserva/:id`, because two of this file's requirements are about where
// the edit screen SENDS her: 6.26/6.27 (a saved price drop lands on a
// detail view reading "Le tenés que devolver") and 6.30/6.31 (a cancelled
// stay's edit URL redirects to that same detail view). A single-route
// harness could assert neither.

const CASA_AZUL = 'a1111111-1111-1111-1111-111111111111'
const GUEST = 'c1111111-1111-1111-1111-111111111111'
const RESERVATION = 'd1111111-1111-1111-1111-111111111111'
const OTHER_STAY = 'd2222222-2222-2222-2222-222222222222'

function cabinsHandler() {
  return http.get('http://localhost:8000/properties', () =>
    HttpResponse.json([{ id: CASA_AZUL, name: 'Casa Azul', is_active: true }]),
  )
}

function clientsHandler() {
  return http.get('http://localhost:8000/clients', () =>
    HttpResponse.json([
      { id: GUEST, full_name: 'Marta González', phone: '11 2233 4455', email: null, national_id: null, is_active: true },
    ]),
  )
}

type ReservationOverrides = {
  readonly status?: string
  readonly price_per_night?: string | null
  readonly price_total?: string | null
  readonly paid_amount?: string
  readonly effective_total?: string
  readonly balance?: string
}

// The stay under edit: `2026-09-03` -> `2026-09-07` on Casa Azul, four
// nights, priced as a stay total of `$ 180.000` unless a test says
// otherwise.
function reservationHandler(overrides: ReservationOverrides = {}) {
  return http.get(`http://localhost:8000/reservations/${RESERVATION}`, () =>
    HttpResponse.json({
      id: RESERVATION,
      property_id: CASA_AZUL,
      client_id: GUEST,
      check_in: '2026-09-03',
      check_out: '2026-09-07',
      status: overrides.status ?? 'confirmed',
      price_per_night: overrides.price_per_night ?? null,
      price_total: overrides.price_total === undefined ? '180000.00' : overrides.price_total,
      paid_amount: overrides.paid_amount ?? '0.00',
      created_at: '2026-08-01T00:00:00Z',
      effective_total: overrides.effective_total ?? '180000.00',
      balance: overrides.balance ?? '180000.00',
      is_completed: false,
    }),
  )
}

// `GET /reservations?property_id=` -- the cabin's complete stay list, which
// is what builds the picker's occupied set. R itself is always in it (the
// server has no idea it is being edited), which is exactly what D34's
// `excludeReservationId` exists to undo.
function cabinStaysHandler(extraStays: readonly Record<string, unknown>[] = []) {
  return http.get('http://localhost:8000/reservations', () =>
    HttpResponse.json([
      {
        id: RESERVATION,
        client_id: GUEST,
        check_in: '2026-09-03',
        check_out: '2026-09-07',
        status: 'confirmed',
        balance: '180000.00',
      },
      ...extraStays,
    ]),
  )
}

// Every payload assertion in this file is made on the REAL request body
// captured by MSW, never on a mutation spy: what goes over the wire is the
// whole of what 6.22/6.23 exists to pin (a bare `{"price_per_night": ...}`
// PATCH raises the table's own `CHECK (num_nonnulls(...) = 1)`), and a
// mocked mutation would only assert this test's idea of it.
// The detail view this screen redirects and returns to reads its own
// payments list; served empty because nothing in this file is about
// payments, only about the totals they produce.
function paymentsHandler() {
  return http.get(`http://localhost:8000/reservations/${RESERVATION}/payments`, () => HttpResponse.json([]))
}

function capturePatches() {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.patch(`http://localhost:8000/reservations/${RESERVATION}`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ id: RESERVATION })
    }),
  )
  return bodies
}

function renderEdit() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/reserva/:id',
        lazy: async () => ({ Component: (await import('../detail/ReservationDetail')).ReservationDetail }),
      },
      {
        path: '/reserva/:id/editar',
        lazy: async () => ({ Component: (await import('./EditReservation')).EditReservation }),
      },
    ],
    { initialEntries: [`/reserva/${RESERVATION}/editar`] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 6.29's second clause, proved structurally rather than by trying to catch
// a transient cache state mid-flight: "the mutation does not optimistically
// apply the new dates before the response". An optimistic update is one of
// exactly two spellings in TanStack Query -- an `onMutate` callback, or a
// direct `setQueryData` -- and neither exists in the module that owns the
// PATCH. The server is the only party that knows whether the cabin is free,
// so writing her new dates into the cache before it answers would paint
// them onto the calendar and then take them away again.
const OPTIMISTIC_WRITE = /onMutate|setQueryData/

const updateReservationSource = import.meta.glob('../useUpdateReservation.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})

describe('useUpdateReservation optimism guard', () => {
  it('the update mutation writes nothing to the cache before the server answers', () => {
    const sources = Object.values(updateReservationSource) as string[]
    // Not a vacuous pass on an empty glob.
    expect(sources).toHaveLength(1)
    expect(OPTIMISTIC_WRITE.test(sources[0]!)).toBe(false)
  })

  // Not a tautology: the matcher above genuinely recognises both spellings
  // of an optimistic write, so its `false` means "absent", not "unmatchable".
  it('the matcher used above detects a real optimistic write', () => {
    expect(OPTIMISTIC_WRITE.test('onMutate: async (variables) => { ... }')).toBe(true)
    expect(OPTIMISTIC_WRITE.test('queryClient.setQueryData(keys.reservation(id), next)')).toBe(true)
    expect(OPTIMISTIC_WRITE.test('onSettled: () => void queryClient.invalidateQueries(...)')).toBe(false)
  })
})

describe('EditReservation', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    server.use(cabinsHandler(), clientsHandler(), cabinStaysHandler(), paymentsHandler())
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // 6.16/6.17, the spec's "The edit view has no cabin or guest control" --
  // `ReservationUpdate` accepts `check_in`, `check_out`, `price_per_night`
  // and `price_total`, and nothing else, so an affordance to change the
  // cabin or the guest would be an affordance to do something the API
  // cannot do.
  //
  // Asserted as a PAIR, on 6.14's own precedent: the dates and price
  // controls MUST be present, so this cannot be satisfied by a screen that
  // renders nothing at all.
  it('renders date and price controls, and no cabin or guest control', async () => {
    server.use(reservationHandler())

    renderEdit()

    // Present: the month grid (a day cell per date) and the price control.
    await waitFor(() => expect(screen.getByTestId('day-2026-09-03')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByRole('button', { name: 'Por noche' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Total de la estadía' })).toBeInTheDocument()
    expect(screen.getByLabelText('Monto')).toBeInTheDocument()

    // Absent: anything that could change WHICH cabin or WHICH guest. The
    // wizard's own cabin step renders each cabin as a button named after
    // it, and its guest step renders free-text fields -- neither shape may
    // appear here.
    expect(screen.queryByRole('button', { name: 'Casa Azul' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('textbox')).toEqual([])
    expect(screen.queryAllByRole('combobox')).toEqual([])
    expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Teléfono/)).not.toBeInTheDocument()
  })

  // 6.20/6.21, the spec's "Moving a stay by one night succeeds without a
  // false block" -- the SUBMITTABLE half (the picker half is
  // `occupancy.test.ts`'s, at the level the exclusion actually lives).
  //
  // D34's own failure mode, made concrete: R moves from 09-03->09-07 to
  // 09-04->09-08, a range that overlaps its OWN former nights. If the
  // picker painted those grey, the second tap would be refused and this
  // shift would be impossible with nothing on screen to explain why.
  it('a one-night shift over the stay\'s own former nights can be selected and saved', async () => {
    server.use(reservationHandler())
    const bodies = capturePatches()

    renderEdit()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('day-2026-09-04')).toBeInTheDocument(), { timeout: 3000 })
    // Not merely "the tap does not throw": the cell must not be marked
    // occupied in the first place, which is the state the picker gates on.
    expect(screen.getByTestId('day-2026-09-04')).not.toHaveAttribute('data-occupied')

    await user.click(screen.getByTestId('day-2026-09-04'))
    await user.click(screen.getByTestId('day-2026-09-08'))

    // The selection registered -- entrada and salida both moved forward a
    // day, and the stay is still four nights.
    await waitFor(() => expect(screen.getByText(/Entrada 4\/9/)).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText(/Salida 8\/9/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar los cambios' }))

    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
    expect(bodies[0]!.check_in).toBe('2026-09-04')
    expect(bodies[0]!.check_out).toBe('2026-09-08')
  })

  async function switchPriceModeTo(label: string, amountPesos: string) {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: label }))
    await user.clear(screen.getByLabelText('Monto'))
    await user.type(screen.getByLabelText('Monto'), amountPesos)
    await user.click(screen.getByRole('button', { name: 'Guardar los cambios' }))
  }

  // 6.22/6.23 -- the trap D34 names outright:
  //
  //   "Sending only `{"price_per_night": 45000}` on a stay-total
  //    reservation therefore leaves both columns populated and raises
  //    `23514 -> 422`, which the owner would see as the generic 'revisá los
  //    datos' for a change she made correctly."
  //
  // The handler applies `model_dump(exclude_unset=True)` and the table
  // carries `CHECK (num_nonnulls(price_per_night, price_total) = 1)`, so an
  // OMITTED key is not the same as a `null` one: the old value survives and
  // both columns end up populated. Asserted on key PRESENCE, not just on
  // value, because `undefined` and `null` are indistinguishable once
  // `JSON.stringify` has dropped the key.
  it('switching from a stay total to a per-night price sends both price fields, one explicitly null', async () => {
    server.use(reservationHandler({ price_per_night: null, price_total: '180000.00' }))
    const bodies = capturePatches()

    renderEdit()

    await waitFor(() => expect(screen.getByLabelText('Monto')).toBeInTheDocument(), { timeout: 3000 })
    await switchPriceModeTo('Por noche', '45000')

    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
    expect(Object.keys(bodies[0]!)).toEqual(expect.arrayContaining(['price_per_night', 'price_total']))
    expect(bodies[0]!.price_per_night).toBe('45000.00')
    expect(bodies[0]!.price_total).toBeNull()
  })

  // 6.22/6.23 [TRIANGULATE], the same rule in the other direction -- so it
  // cannot be satisfied by hardcoding one of the two shapes.
  it('switching from a per-night price to a stay total sends both price fields, one explicitly null', async () => {
    server.use(reservationHandler({ price_per_night: '45000.00', price_total: null }))
    const bodies = capturePatches()

    renderEdit()

    await waitFor(() => expect(screen.getByLabelText('Monto')).toBeInTheDocument(), { timeout: 3000 })
    await switchPriceModeTo('Total de la estadía', '180000')

    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
    expect(Object.keys(bodies[0]!)).toEqual(expect.arrayContaining(['price_per_night', 'price_total']))
    expect(bodies[0]!.price_total).toBe('180000.00')
    expect(bodies[0]!.price_per_night).toBeNull()
  })

  // Extends the stay by one night without touching the price control at
  // all: 2026-09-03 -> 2026-09-08 is five nights instead of four.
  async function extendStayByOneNight() {
    const user = userEvent.setup()
    await user.click(screen.getByTestId('day-2026-09-03'))
    await user.click(screen.getByTestId('day-2026-09-08'))
    // Waits on the summary's own salida line, not on "5 noches": the
    // rescale helper below the price control says "5 noches" too, and a
    // bare `getByText(/5 noches/)` would match both elements.
    await waitFor(() => expect(screen.getByText(/Salida 8\/9/)).toBeInTheDocument(), { timeout: 3000 })
  }

  // 6.24/6.25, the spec's "Editing Rescales Or Preserves Price Identically
  // To Recording". D34: "The rescale rule is shown, not inferred...
  // Otherwise she extends a stay by one night and the total either moves or
  // fails to move without her having asked for either."
  //
  // The same rule `reservation-recording` already carries (5.22/5.23),
  // which is why 6.25 reuses that logic rather than writing a second copy
  // of the multiplication.
  it('extending a per-night-priced stay rescales the total live, with no re-entry', async () => {
    // A non-round `paid_amount` on purpose: the money block also renders
    // `Pagado` and `Saldo` (6.27), and a stay with nothing paid would make
    // `Saldo` read `$ 180.000` too, so the assertions below would be
    // matching the wrong line as often as the right one.
    server.use(reservationHandler({ price_per_night: '45000.00', price_total: null, paid_amount: '20000.00' }))

    renderEdit()

    await waitFor(() => expect(screen.getByTestId('day-2026-09-03')).toBeInTheDocument(), { timeout: 3000 })
    // Four nights at $ 45.000 to begin with.
    expect(screen.getByText('$ 180.000')).toBeInTheDocument()

    await extendStayByOneNight()

    expect(screen.getByText('$ 225.000')).toBeInTheDocument()
    expect(screen.queryByText('$ 180.000')).not.toBeInTheDocument()
  })

  // The other half of the same rule, and the one that makes it a rule
  // rather than a multiplication: a stay-total price is never multiplied by
  // anything, so the same date change must leave it exactly where it was.
  // 6.26/6.27, the spec's "Lowering An Edited Price Below What Has Been
  // Paid Is Allowed". D34: "Lowering the price below what has been paid is
  // allowed, with no guard and no confirmation. The screen previews the
  // resulting `Saldo` live through `displayBalance()`, so a negative result
  // reads 'Le tenés que devolver $ 20.000' BEFORE she saves rather than as
  // a surprise after. That is a normal state, never an error."
  //
  // The PATCH handler does the SERVER's arithmetic (the 6.40 convention):
  // the new price becomes the new `effective_total`, and `balance` follows
  // from what was already paid -- so the detail view afterwards is reading
  // a real consequence rather than a second hardcoded fixture.
  it('lowering the price below what was already paid is accepted, and reads as a refund owed', async () => {
    let effectiveTotalCentavos = 18000000
    const paidCentavos = 18000000
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.get(`http://localhost:8000/reservations/${RESERVATION}`, () =>
        HttpResponse.json({
          id: RESERVATION,
          property_id: CASA_AZUL,
          client_id: GUEST,
          check_in: '2026-09-03',
          check_out: '2026-09-07',
          status: 'confirmed',
          price_per_night: null,
          price_total: (effectiveTotalCentavos / 100).toFixed(2),
          paid_amount: (paidCentavos / 100).toFixed(2),
          created_at: '2026-08-01T00:00:00Z',
          effective_total: (effectiveTotalCentavos / 100).toFixed(2),
          balance: ((effectiveTotalCentavos - paidCentavos) / 100).toFixed(2),
          is_completed: false,
        }),
      ),
      http.patch(`http://localhost:8000/reservations/${RESERVATION}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        effectiveTotalCentavos = Math.round(Number(body.price_total) * 100)
        return HttpResponse.json({ id: RESERVATION })
      }),
    )

    const router = renderEdit()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByLabelText('Monto')).toBeInTheDocument(), { timeout: 3000 })
    await user.clear(screen.getByLabelText('Monto'))
    await user.type(screen.getByLabelText('Monto'), '100000')

    // The live preview, BEFORE saving: `$ 180.000` taken in against a
    // `$ 100.000` stay is `$ 80.000` to give back.
    await waitFor(() => expect(screen.getByText('Le tenés que devolver')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText('$ 80.000')).toBeInTheDocument()
    // Accepted with NO guard: no blocking sentence, no confirmation, and
    // the save affordance is reachable exactly as it is for any other edit.
    expect(screen.queryAllByRole('alert')).toEqual([])
    expect(document.querySelectorAll('[data-tone="error"]')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Guardar los cambios' }))

    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 3000 })
    expect(bodies[0]!.price_total).toBe('100000.00')

    // And it lands back on the detail view, which now says the same thing
    // about a saved stay that the preview said about an unsaved one.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/reserva/${RESERVATION}`), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText('Le tenés que devolver')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText('$ 80.000')).toBeInTheDocument()
  })

  // 6.28/6.29, the spec's "A Conflicting Date Edit Fails Visibly, Naming
  // Which Nights Are Free".
  //
  // The scenario is the real one, not a contrived one: she opens the edit
  // screen while Casa Azul is free from the 9th, another device books
  // 09-10 -> 09-12 while she is choosing, and her PATCH comes back
  // `409 dates_unavailable`. Her own list was correct when it was fetched,
  // which is exactly why the picker let her select those nights and exactly
  // why the message has to tell her something she does not already know.
  //
  // What makes the message possible at all is 6.12's `onSettled`
  // invalidation: the failed write refetches the cabin's stay list, so by
  // the time the sentence renders the client has learned about S and can
  // say which of her chosen nights are still hers to take.
  it('an overlapping date edit is refused in plain language, naming the cabin and the nights still free', async () => {
    let anotherDeviceHasBooked = false
    server.use(
      reservationHandler(),
      http.get('http://localhost:8000/reservations', () =>
        HttpResponse.json([
          {
            id: RESERVATION,
            client_id: GUEST,
            check_in: '2026-09-03',
            check_out: '2026-09-07',
            status: 'confirmed',
            balance: '180000.00',
          },
          ...(anotherDeviceHasBooked
            ? [
                {
                  id: OTHER_STAY,
                  client_id: GUEST,
                  check_in: '2026-09-10',
                  check_out: '2026-09-12',
                  status: 'confirmed',
                  balance: '0.00',
                },
              ]
            : []),
        ]),
      ),
      http.patch(`http://localhost:8000/reservations/${RESERVATION}`, () => {
        anotherDeviceHasBooked = true
        return HttpResponse.json(
          { detail: 'Dates are not available for this property', code: 'dates_unavailable' },
          { status: 409 },
        )
      }),
    )

    const router = renderEdit()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('day-2026-09-09')).toBeInTheDocument(), { timeout: 3000 })
    await user.click(screen.getByTestId('day-2026-09-09'))
    await user.click(screen.getByTestId('day-2026-09-12'))
    await waitFor(() => expect(screen.getByText(/Salida 12\/9/)).toBeInTheDocument(), { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: 'Guardar los cambios' }))

    // Names the cabin, and names which of HER nights survive: the 9th is
    // still free, the 10th and the 11th are not.
    await waitFor(
      () =>
        expect(
          screen.getByText('Casa Azul ya está ocupada esas noches. De las que elegiste, todavía están libres el 9/9.'),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    )

    // D32: no status, no code, no English `detail`, and none of the words
    // the glossary forbids on any surface.
    const alert = screen.getByRole('alert')
    expect(alert.textContent).not.toMatch(/error|conflicto|409|Dates are not available/i)

    // She is still on the edit screen -- a refused save navigates nowhere.
    expect(router.state.location.pathname).toBe(`/reserva/${RESERVATION}/editar`)

    // And R's dates are unchanged: going back to the detail shows the stay
    // exactly as it was, never the dates she asked for. This is also the
    // observable half of "the mutation does not optimistically apply the
    // new dates before the response" -- nothing ever wrote them anywhere.
    await user.click(screen.getByRole('link', { name: 'Volver' }))
    await waitFor(() => expect(screen.getByText('3/9')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText('7/9')).toBeInTheDocument()
    expect(screen.queryByText('9/9')).not.toBeInTheDocument()
    expect(screen.queryByText('12/9')).not.toBeInTheDocument()
  })

  // 6.30/6.31. D34: "A cancelled reservation offers no editing -- in TWO
  // places, because a hidden button is not a closed route. Screen 06
  // renders the action block only when `status !== 'cancelled'`, AND
  // `/reserva/:id/editar` redirects to the detail when the loaded stay is
  // cancelled, covering a bookmark, a back button, and a stale tab."
  //
  // 6.14/6.15 built the first place. This is the second, and it matters
  // because the API would happily accept the PATCH: it does not check
  // status, and a cancelled row sits outside the `EXCLUDE` predicate, so
  // any dates at all would pass. The interface is the only thing standing
  // between a stale tab and a silently edited cancelled stay.
  it('a cancelled stay opened at the edit URL redirects to its detail instead of rendering the form', async () => {
    server.use(reservationHandler({ status: 'cancelled', paid_amount: '0.00', balance: '0.00' }))

    const router = renderEdit()

    await waitFor(() => expect(router.state.location.pathname).toBe(`/reserva/${RESERVATION}`), { timeout: 3000 })

    // Not merely "the URL moved": none of the edit form is on screen, so
    // there is nothing to type into and nothing to submit.
    expect(screen.queryByTestId('day-2026-09-03')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Monto')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar los cambios' })).not.toBeInTheDocument()

    // Replaced, not pushed: the back button must not bounce her straight
    // into the URL she was just redirected out of.
    expect(router.state.location.pathname).toBe(`/reserva/${RESERVATION}`)
  })

  // The guard's interaction with what Phase 6c shipped, asserted rather
  // than assumed. 6.32-6.44 made a cancelled stay's detail view carry a
  // reminder and a REACHABLE "Devolución" -- so the redirect target is the
  // ordinary detail screen in its ordinary cancelled state, and this guard
  // must not suppress or short-circuit the refund branch on the way in. A
  // guard that redirected somewhere emptier would close the only route she
  // has to give her guest's money back.
  it('the redirect lands on the ordinary cancelled detail, refund affordance and all', async () => {
    server.use(reservationHandler({ status: 'cancelled', paid_amount: '100000.00', balance: '0.00' }))

    const router = renderEdit()

    await waitFor(() => expect(router.state.location.pathname).toBe(`/reserva/${RESERVATION}`), { timeout: 3000 })

    await waitFor(() => expect(screen.getByText(/todavía tenés \$ 100\.000 cobrados/)).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(screen.getByRole('button', { name: 'Devolución' })).toBeInTheDocument()
    // And still no way back into editing, from either place.
    expect(screen.queryAllByRole('link').map((link) => link.getAttribute('href'))).not.toContain(
      `/reserva/${RESERVATION}/editar`,
    )
  })

  it('extending a stay-total-priced stay leaves the total untouched', async () => {
    server.use(reservationHandler({ price_per_night: null, price_total: '180000.00', paid_amount: '20000.00' }))

    renderEdit()

    await waitFor(() => expect(screen.getByTestId('day-2026-09-03')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByText('$ 180.000')).toBeInTheDocument()

    await extendStayByOneNight()

    expect(screen.getByText('$ 180.000')).toBeInTheDocument()
    expect(screen.queryByText('$ 225.000')).not.toBeInTheDocument()
  })
})
