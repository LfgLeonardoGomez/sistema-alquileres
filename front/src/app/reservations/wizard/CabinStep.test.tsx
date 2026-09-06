import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../test/setup'

// task 5.4/5.5, `reservation-recording` spec "Only Active Cabins Are
// Offered On The Cabin Step": `useCabins()` fetches with
// `include_inactive=true` (D30, so a deactivated cabin's PAST stays still
// resolve a name elsewhere), so THIS step is the one place responsible for
// filtering it back down to `is_active` cabins for a NEW reservation.

const ACTIVE_CABIN = 'a1111111-1111-1111-1111-111111111111'
const INACTIVE_CABIN = 'b2222222-2222-2222-2222-222222222222'

function renderCabinStep(onSelected: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CabinStepUnderTest onSelected={onSelected} />
    </QueryClientProvider>,
  )
}

// Dynamic import per this run's established discipline (`env.test.ts`,
// `client.test.tsx`): `CabinStep.tsx` transitively imports `app/api/client.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CabinStepUnderTest: any

describe('CabinStep', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(async () => {
    import.meta.env.VITE_API_BASE_URL = 'http://localhost:8000'
    import.meta.env.VITE_TENANT_SLUG = 'mar-del-tuyu-cabins'
    const mod = await import('./CabinStep')
    CabinStepUnderTest = mod.CabinStep
  })

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv)
  })

  it('offers only the active cabin when one active and one deactivated cabin exist', async () => {
    server.use(
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([
          { id: ACTIVE_CABIN, name: 'Casa Azul', is_active: true },
          { id: INACTIVE_CABIN, name: 'Casa Vieja', is_active: false },
        ]),
      ),
    )

    renderCabinStep(() => {})

    expect(await screen.findByRole('button', { name: 'Casa Azul' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Casa Vieja' })).not.toBeInTheDocument()
  })

  it('calls onSelected with the chosen active cabin when tapped', async () => {
    server.use(
      http.get('http://localhost:8000/properties', () =>
        HttpResponse.json([{ id: ACTIVE_CABIN, name: 'Casa Azul', is_active: true }]),
      ),
    )
    let selectedCabinId: string | null = null

    renderCabinStep(() => {
      selectedCabinId = ACTIVE_CABIN
    })

    const button = await screen.findByRole('button', { name: 'Casa Azul' })
    await userEvent.click(button)

    expect(selectedCabinId).toBe(ACTIVE_CABIN)
  })
})
