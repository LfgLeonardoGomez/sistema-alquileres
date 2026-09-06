import { describe, expect, it } from 'vitest'

// task 5.1: the wizard draft's initial shape -- the second and last of the
// app's exactly two Zustand stores (D30). Read directly via `getState()`,
// the same non-hook access point `client.ts`'s 401 interceptor uses on the
// session store -- this store is deliberately readable outside a component
// too, since it must survive the wizard tree unmounting (D29).

describe('useWizardDraftStore', () => {
  it('starts with an empty draft: cabin, dates, guest, priceMode and amount all null', async () => {
    const { useWizardDraftStore } = await import('./store')

    const state = useWizardDraftStore.getState()

    expect(state.cabin).toBeNull()
    expect(state.dates).toBeNull()
    expect(state.guest).toBeNull()
    expect(state.priceMode).toBeNull()
    expect(state.amount).toBeNull()
  })

  // [TRIANGULATE] proves `reset()` (5.27's own mechanism) actually returns
  // to that same empty shape after every field has been written, not merely
  // that the shape starts empty.
  it('reset() returns a fully-populated draft to the same empty shape', async () => {
    const { useWizardDraftStore } = await import('./store')

    useWizardDraftStore.getState().setCabin({ id: 'cab-1', name: 'Casa Azul' })
    useWizardDraftStore.getState().setDates({ checkIn: '2026-09-08' as never, checkOut: '2026-09-12' as never })
    useWizardDraftStore.getState().setGuest({ id: 'cli-1', fullName: 'Marta González', phone: '1122334455' })
    useWizardDraftStore.getState().setPrice('per_night', 4500000)

    useWizardDraftStore.getState().reset()

    const state = useWizardDraftStore.getState()
    expect(state).toMatchObject({ cabin: null, dates: null, guest: null, priceMode: null, amount: null })
  })
})
