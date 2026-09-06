import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'
import { GUESTS_COPY, guestPhoneBelongsToAnotherMessage } from '../../../shared/copy/guests'

// task 5.16-5.19, D33: the find-or-create-or-reactivate sheet. Both the
// active-match and the reactivation scenarios return the SAME 200 status
// (D8: `deleted_at` is simply cleared either way) -- distinguishing them at
// the client would require a field the API never sends, so this test suite
// asserts on the outcome (the same client, never a duplicate), not on a
// client-side reactivation flag that cannot exist.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GuestStepUnderTest: any

function renderGuestStep(onContinue: (guest: unknown) => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestStepUnderTest initialGuest={null} onContinue={onContinue} onBack={() => {}} />
    </QueryClientProvider>,
  )
}

async function fillAndSearch(phone: string, name: string) {
  await userEvent.type(screen.getByLabelText(GUESTS_COPY.phoneLabel), phone)
  await userEvent.type(screen.getByLabelText(GUESTS_COPY.nameLabel), name)
  await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.search }))
}

describe('GuestStep', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./GuestStep')
    GuestStepUnderTest = mod.GuestStep
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('resolves an existing active guest by phone, creating no new record (a 200 response)', async () => {
    let requestBody: unknown = null
    server.use(
      http.post('http://localhost:8000/clients', async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json(
          { id: 'cli-1', full_name: 'Ana Existente', phone: '1122334455', email: null, national_id: null, is_active: true },
          { status: 200 },
        )
      }),
    )

    renderGuestStep()
    await fillAndSearch('1122334455', 'Ana Existente')

    expect(await screen.findByText('Ana Existente')).toBeInTheDocument()
    expect(requestBody).toEqual({ full_name: 'Ana Existente', phone: '1122334455' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the D33 conflict sentence, using the API\'s own returned name, rather than silently renaming', async () => {
    server.use(
      http.post('http://localhost:8000/clients', () =>
        HttpResponse.json(
          { id: 'cli-2', full_name: 'Marta González', phone: '1122334455', email: null, national_id: null, is_active: true },
          { status: 200 },
        ),
      ),
    )

    renderGuestStep()
    await fillAndSearch('1122334455', 'Marta')

    expect(await screen.findByRole('alert')).toHaveTextContent(guestPhoneBelongsToAnotherMessage('Marta González'))
    // The resolved guest shown is the API's real name, never the typed one.
    expect(screen.getByText('Marta González')).toBeInTheDocument()
    expect(screen.queryByText('Marta')).not.toBeInTheDocument()
  })

  // [TRIANGULATE] task 5.18: a deactivated guest reactivates (still a 200,
  // per D8 -- see this file's own module note) rather than a duplicate.
  it('reactivates a deactivated guest by phone rather than creating a duplicate', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/clients', () => {
        requestCount += 1
        return HttpResponse.json(
          { id: 'cli-3', full_name: 'Guest Reactivado', phone: '1155667788', email: null, national_id: null, is_active: true },
          { status: 200 },
        )
      }),
    )

    renderGuestStep()
    await fillAndSearch('1155667788', 'Guest Reactivado')

    expect(await screen.findByText('Guest Reactivado')).toBeInTheDocument()
    expect(requestCount).toBe(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('proceeds using the resolved guest when "Seguir" is tapped', async () => {
    server.use(
      http.post('http://localhost:8000/clients', () =>
        HttpResponse.json(
          { id: 'cli-4', full_name: 'Nueva Huésped', phone: '1100000000', email: null, national_id: null, is_active: true },
          { status: 201 },
        ),
      ),
    )
    let continuedWith: unknown = null

    renderGuestStep((guest) => {
      continuedWith = guest
    })
    await fillAndSearch('1100000000', 'Nueva Huésped')
    await screen.findByText('Nueva Huésped')
    await userEvent.click(screen.getByRole('button', { name: GUESTS_COPY.seguir }))

    expect(continuedWith).toEqual({ id: 'cli-4', fullName: 'Nueva Huésped', phone: '1100000000' })
  })
})
