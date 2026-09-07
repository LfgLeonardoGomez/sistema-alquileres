import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'
import { GUESTS_COPY } from '../../shared/copy/guests'

// tasks 7.15/7.16, `guest-directory` spec's "Add/Edit Guest Forms Reject A
// Blank Name Or Phone Before Submitting" -- the spec's own generic title
// ("Add/Edit", not just "Add"): this test file exercises `GuestForm` in
// isolation, the shared component both the add-guest sheet (7.3/7.4) and
// the wizard's `GuestStep` (via 5.16-5.19) wrap a mutation around, rather
// than re-proving the guard once per mount point.
//
// Wired to a REAL `useFindOrCreateGuest` call, on this codebase's own
// established convention (`EditReservation.test.tsx`'s own comment: "every
// payload assertion... made on the REAL request body captured by MSW,
// never on a mutation spy") -- "no request MUST be sent" is asserted
// against an actual captured `POST /clients` count, not a spied callback a
// guard could bypass and still pass.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GuestFormUnderTest: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useFindOrCreateGuestUnderTest: any

function Harness({ submitLabel }: { readonly submitLabel: string }) {
  const findOrCreateGuest = useFindOrCreateGuestUnderTest()
  return (
    <GuestFormUnderTest
      submitLabel={submitLabel}
      onSubmit={(values: { fullName: string; phone: string }) => void findOrCreateGuest.mutate(values)}
    />
  )
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness submitLabel={GUESTS_COPY.seguir} />
    </QueryClientProvider>,
  )
}

describe('GuestForm', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const formMod = await import('./GuestForm')
    GuestFormUnderTest = formMod.GuestForm
    const hookMod = await import('./useFindOrCreateGuest')
    useFindOrCreateGuestUnderTest = hookMod.useFindOrCreateGuest
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // task 7.15/7.16, the spec's own literal scenario: a name entered, phone
  // left blank -- no request sent. Asserted via the submit button's own
  // `disabled` state (the structural half: there is no click handler path
  // that reaches `onSubmit` while `canSubmit` is false) AND via the network
  // boundary itself, so a future change that dropped the `disabled`
  // attribute but kept the internal guard would still be caught here.
  it('sends no request when the phone field is left blank', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/clients', async ({ request }) => {
        requestCount += 1
        const body = (await request.json()) as { full_name: string; phone: string }
        return HttpResponse.json(
          { id: 'cli-1', full_name: body.full_name, phone: body.phone, email: null, national_id: null, is_active: true },
          { status: 201 },
        )
      }),
    )

    renderForm()
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Marta González')

    const submit = screen.getByRole('button', { name: GUESTS_COPY.seguir })
    expect(submit).toBeDisabled()
    await userEvent.click(submit)

    expect(requestCount).toBe(0)
  })

  it('sends no request when the name field is left blank', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/clients', () => {
        requestCount += 1
        return HttpResponse.json({ id: 'cli-2', full_name: '', phone: '1122334455', email: null, national_id: null, is_active: true }, { status: 201 })
      }),
    )

    renderForm()
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.phoneLabel), '1122334455')

    const submit = screen.getByRole('button', { name: GUESTS_COPY.seguir })
    expect(submit).toBeDisabled()
    await userEvent.click(submit)

    expect(requestCount).toBe(0)
  })

  // [TRIANGULATE]: the guard does not block a genuinely complete submission.
  it('sends exactly one request once both fields are filled', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/clients', () => {
        requestCount += 1
        return HttpResponse.json(
          { id: 'cli-3', full_name: 'Marta González', phone: '1122334455', email: null, national_id: null, is_active: true },
          { status: 201 },
        )
      }),
    )

    renderForm()
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.phoneLabel), '1122334455')
    await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), 'Marta González')

    const submit = screen.getByRole('button', { name: GUESTS_COPY.seguir })
    expect(submit).not.toBeDisabled()
    await userEvent.click(submit)

    expect(requestCount).toBe(1)
  })
})
