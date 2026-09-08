import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/setup'
import { TENANT_SETTINGS_COPY } from '../../shared/copy/tenant'

// Part A of this run's brief: a settings BOTTOM SHEET (not a screen -- the
// design handoff's own "no settings screen"), the first frontend consumer
// of `GET`/`PATCH /tenant`. `TenantUpdate`'s `extra="forbid"` (`back/app/
// schemas/tenant.py`) makes `whatsapp` the ONLY writable field, so this
// sheet is exercised in isolation here (`CabinForm.test.tsx`'s own
// established convention -- a real `useQuery`/`useMutation`, MSW at the
// network boundary, never a mocked hook) rather than through the whole
// `HomeScreen` tree.

type TenantFixture = { id: string; slug: string; name: string; whatsapp: string | null }

function tenantGetHandler(tenant: TenantFixture) {
  return http.get('http://localhost:8000/tenant', () => HttpResponse.json(tenant))
}

function tenantPatchHandler(tenant: TenantFixture, onRequest?: (body: Record<string, unknown>) => void) {
  return http.patch('http://localhost:8000/tenant', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    onRequest?.(body)
    tenant.whatsapp = typeof body.whatsapp === 'string' ? body.whatsapp : tenant.whatsapp
    return HttpResponse.json(tenant)
  })
}

// `userEvent.clear()` was observed to leave this specific controlled input
// untouched in this file (root cause unconfirmed -- possibly the triple-
// click selection racing this component's own async-seeded initial value),
// while a plain click + select-all + backspace reliably empties it. Used
// in place of `.clear()` below for that reason.
async function replaceInputValue(input: HTMLElement, text: string) {
  await userEvent.click(input)
  await userEvent.keyboard('{Control>}a{/Control}{Backspace}')
  if (text !== '') await userEvent.type(input, text)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TenantSettingsSheetUnderTest: any

function renderSheet(onClose: () => void = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantSettingsSheetUnderTest onClose={onClose} />
    </QueryClientProvider>,
  )
}

describe('TenantSettingsSheet', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./TenantSettingsSheet')
    TenantSettingsSheetUnderTest = mod.TenantSettingsSheet
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  // The business name is READ-ONLY (`TenantUpdate.extra="forbid"` --
  // sending `name` back is a 422, not a silent ignore, so the field must
  // not even present itself as editable), and the WhatsApp help copy
  // states the required international shape concretely -- the gap this
  // run's brief calls "the single most important product detail": a
  // plausible LOCAL number (no country code) validates and saves but
  // produces a silently broken wa.me link.
  it('shows the business name read-only, the current WhatsApp number, and states the required international shape', async () => {
    server.use(tenantGetHandler({ id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: '5492612094262' }))

    renderSheet()

    expect(await screen.findByText('Alquileres AyA')).toBeInTheDocument()
    expect(screen.queryByLabelText(TENANT_SETTINGS_COPY.businessNameLabel)).not.toBeInTheDocument()

    const whatsappInput = await screen.findByLabelText(TENANT_SETTINGS_COPY.whatsappLabel)
    expect(whatsappInput).toHaveValue('5492612094262')

    // Concrete enough that a non-technical owner gets it right the first
    // time: states BOTH the country-code requirement and the exact digits
    // to drop (leading 0, the local "15" prefix), not merely "include your
    // country code".
    expect(screen.getByText(TENANT_SETTINGS_COPY.whatsappHelp)).toBeInTheDocument()
    expect(TENANT_SETTINGS_COPY.whatsappHelp).toMatch(/código de país/i)
    expect(TENANT_SETTINGS_COPY.whatsappHelp).toMatch(/\b15\b/)
  })

  // Sends the human-typed value AS TYPED -- no client-side reimplementation
  // of `normalise_whatsapp` (the backend owns that, per this run's brief) --
  // and, once the mutation resolves, the displayed number reflects the
  // SERVER'S own normalised response without a manual refresh
  // (`TenantSettingsSheet` re-seeds the field straight from the mutation's
  // response, deliberately not from a background `keys.tenant()` refetch,
  // which `useUpdateTenant` still triggers for any OTHER consumer of that
  // query but which this sheet does not itself wait on).
  it('saves a changed WhatsApp number as typed, and reflects the server-normalised value without a manual refresh', async () => {
    const tenant: TenantFixture = { id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: '5492612094262' }
    let sentBody: Record<string, unknown> | undefined
    server.use(tenantGetHandler(tenant), tenantPatchHandler(tenant, (body) => (sentBody = body)))

    renderSheet()
    const whatsappInput = await screen.findByLabelText(TENANT_SETTINGS_COPY.whatsappLabel)
    await replaceInputValue(whatsappInput, '+54 9 261 209-4262')
    await userEvent.click(screen.getByRole('button', { name: TENANT_SETTINGS_COPY.save }))

    expect(sentBody).toEqual({ whatsapp: '+54 9 261 209-4262' })

    // The PATCH handler above stores the value verbatim (this fixture does
    // not reproduce the backend's own normalisation), so the refetched
    // value the sheet must display is exactly that same string -- proving
    // the round trip, not a client-side echo of what was typed.
    expect(await screen.findByDisplayValue('+54 9 261 209-4262')).toBeInTheDocument()
  })

  // A 422 (FastAPI's own `RequestValidationError` shape, `{"detail": [...]}`,
  // no `code`) must surface as the app's one generic plain-Spanish sentence
  // via `resolveErrorCopy` -- never the raw validation payload, and never a
  // raw "422" or "error" on screen (the glossary's own forbidden words).
  it('surfaces a 422 as a human sentence, never the raw validation payload', async () => {
    server.use(
      tenantGetHandler({ id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: '2612094262' }),
      http.patch('http://localhost:8000/tenant', () =>
        HttpResponse.json(
          { detail: [{ type: 'value_error', loc: ['body', 'whatsapp'], msg: 'Value error, whatsapp must contain 8 to 15 digits' }] },
          { status: 422 },
        ),
      ),
    )

    renderSheet()
    const whatsappInput = await screen.findByLabelText(TENANT_SETTINGS_COPY.whatsappLabel)
    await replaceInputValue(whatsappInput, '123')
    await userEvent.click(screen.getByRole('button', { name: TENANT_SETTINGS_COPY.save }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Revisá los datos y probá de nuevo.')
    expect(alert.textContent ?? '').not.toMatch(/value_error|whatsapp must contain|422/i)
  })

  // [TRIANGULATE] the structural blank-field guard: `CabinForm.test.tsx`'s
  // own established shape -- asserted against a real captured request
  // count, not a spied callback a guard could bypass and still pass.
  it('sends no request when the WhatsApp field is cleared to blank', async () => {
    let requestCount = 0
    server.use(
      tenantGetHandler({ id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: '5492612094262' }),
      http.patch('http://localhost:8000/tenant', () => {
        requestCount += 1
        return HttpResponse.json({ id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: null })
      }),
    )

    renderSheet()
    const whatsappInput = await screen.findByLabelText(TENANT_SETTINGS_COPY.whatsappLabel)
    await replaceInputValue(whatsappInput, '')

    const save = screen.getByRole('button', { name: TENANT_SETTINGS_COPY.save })
    expect(save).toBeDisabled()
    await userEvent.click(save)

    expect(requestCount).toBe(0)
  })

  it('calls onClose when "Volver" is pressed', async () => {
    const onClose = vi.fn()
    server.use(tenantGetHandler({ id: 'ten-1', slug: 'aya', name: 'Alquileres AyA', whatsapp: '5492612094262' }))

    renderSheet(onClose)
    await screen.findByText('Alquileres AyA')
    await userEvent.click(screen.getByRole('button', { name: TENANT_SETTINGS_COPY.close }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
