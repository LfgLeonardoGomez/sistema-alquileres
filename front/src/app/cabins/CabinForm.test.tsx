import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'
import { CABIN_FORM_COPY } from '../../shared/copy/cabins'

// tasks 8.5/8.6, `cabin-directory` spec's "Adding A Cabin Requires A
// Non-Blank Name" -- `GuestForm.test.tsx`'s own established shape (7.15/
// 7.16): this file exercises `CabinForm` in isolation, wired to a REAL
// `useAddCabin` call, so "no request MUST be sent" is asserted against an
// actual captured `POST /properties` count, not a spied callback a guard
// could bypass and still pass.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CabinFormUnderTest: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let useAddCabinUnderTest: any

function Harness() {
  const addCabin = useAddCabinUnderTest()
  return (
    <CabinFormUnderTest
      submitLabel={CABIN_FORM_COPY.addSubmit}
      onSubmit={(values: { name: string }) => void addCabin.mutate(values)}
    />
  )
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  )
}

describe('CabinForm', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const formMod = await import('./CabinForm')
    CabinFormUnderTest = formMod.CabinForm
    const hookMod = await import('./useAddCabin')
    useAddCabinUnderTest = hookMod.useAddCabin
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // task 8.5/8.6, the spec's own literal scenario: an empty name field
  // blocks submission. Asserted via the submit button's own `disabled`
  // state (the structural half) AND via the network boundary itself.
  it('sends no request when the name field is left blank', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/properties', () => {
        requestCount += 1
        return HttpResponse.json({ id: 'cab-1', name: '', created_at: '2026-01-01T00:00:00Z', is_active: true }, { status: 201 })
      }),
    )

    renderForm()
    const submit = screen.getByRole('button', { name: CABIN_FORM_COPY.addSubmit })
    expect(submit).toBeDisabled()
    await userEvent.click(submit)

    expect(requestCount).toBe(0)
  })

  // [TRIANGULATE]: the guard does not block a genuinely complete submission,
  // and does not survive on whitespace alone.
  it('sends no request when the name field holds only whitespace', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/properties', () => {
        requestCount += 1
        return HttpResponse.json({ id: 'cab-2', name: '   ', created_at: '2026-01-01T00:00:00Z', is_active: true }, { status: 201 })
      }),
    )

    renderForm()
    await userEvent.type(screen.getByLabelText(CABIN_FORM_COPY.nameLabel), '   ')

    const submit = screen.getByRole('button', { name: CABIN_FORM_COPY.addSubmit })
    expect(submit).toBeDisabled()
    await userEvent.click(submit)

    expect(requestCount).toBe(0)
  })

  it('sends exactly one request once the name is filled', async () => {
    let requestCount = 0
    server.use(
      http.post('http://localhost:8000/properties', () => {
        requestCount += 1
        return HttpResponse.json({ id: 'cab-3', name: 'Casa Azul', created_at: '2026-01-01T00:00:00Z', is_active: true }, { status: 201 })
      }),
    )

    renderForm()
    await userEvent.type(screen.getByLabelText(CABIN_FORM_COPY.nameLabel), 'Casa Azul')

    const submit = screen.getByRole('button', { name: CABIN_FORM_COPY.addSubmit })
    expect(submit).not.toBeDisabled()
    await userEvent.click(submit)

    expect(requestCount).toBe(1)
  })
})
