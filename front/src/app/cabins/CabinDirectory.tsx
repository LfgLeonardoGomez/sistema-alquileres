import { useState } from 'react'
import { CABIN_DIRECTORY_COPY, CABIN_EDIT_SHEET_COPY, CABIN_FORM_COPY, occupiedNightsThisMonthLabel } from '../../shared/copy/cabins'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { TabBar } from '../shell/TabBar'
import { useCabins, type Cabin } from '../reservations/useCabins'
import { CabinEditSheet } from './CabinEditSheet'
import { CabinForm } from './CabinForm'
import { useAddCabin } from './useAddCabin'
import { occupiedNightsFor, useDashboardSummary } from './useDashboardSummary'

// task 8.1/8.2, handoff screen 08 ("Cabañas"). `useCabins()` (4.9) is the
// app's ONE lookup call site for `/properties` (D30, `lookups.test.ts`'s
// own standing regression guard) and already fetches `include_inactive=true` --
// this screen renders EVERY cabin the lookup returns, active or not,
// `GuestDirectory.tsx`'s own precedent for the identical situation (a
// deactivated row stays visible rather than vanishing, which is the
// concrete, on-screen proof behind 8.1's "past reservations remain fully
// readable, with the cabin's name still resolvable" -- the cabin itself
// never disappears, here or anywhere else that reads `useCabins()`).
//
// `data-tone="muted"` on an inactive cabin's row is the same styling-hook
// convention `GuestDirectory.tsx`'s inactive row already established --
// not drawn in the handoff (screen 08 only draws two ACTIVE cards), but
// the same extrapolation `GuestDirectory` made for guests, recorded here
// rather than silently invented.

export function CabinDirectory() {
  const cabins = useCabins()
  const dashboard = useDashboardSummary()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingCabin, setEditingCabin] = useState<Cabin | null>(null)
  const addCabin = useAddCabin()

  async function handleAdd(values: { readonly name: string }) {
    try {
      await addCabin.mutateAsync(values)
      setIsAddOpen(false)
    } catch {
      // Surfaced below via `.isError`/`.error`; the form stays open.
    }
  }

  return (
    <div>
      <h1>{CABIN_DIRECTORY_COPY.title}</h1>

      <ul>
        {(cabins.data ?? []).map((cabin) => (
          <li key={cabin.id} data-tone={cabin.is_active ? undefined : 'muted'}>
            <span>{cabin.name}</span>
            <span>{occupiedNightsThisMonthLabel(occupiedNightsFor(dashboard.data?.properties, cabin.id))}</span>
            <button type="button" onClick={() => setEditingCabin(cabin)}>
              {CABIN_DIRECTORY_COPY.edit}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => setIsAddOpen(true)}>
        {CABIN_DIRECTORY_COPY.addCabin}
      </button>
      <p>{CABIN_DIRECTORY_COPY.footnote}</p>

      {isAddOpen ? (
        <div role="dialog" aria-label={CABIN_DIRECTORY_COPY.addCabin}>
          <CabinForm submitLabel={CABIN_FORM_COPY.addSubmit} onSubmit={(values) => void handleAdd(values)} />
          {addCabin.isError ? <p role="alert">{resolveErrorCopy(addCabin.error)}</p> : null}
          <button type="button" onClick={() => setIsAddOpen(false)}>
            {CABIN_EDIT_SHEET_COPY.close}
          </button>
        </div>
      ) : null}

      {editingCabin !== null ? <CabinEditSheet cabin={editingCabin} onClose={() => setEditingCabin(null)} /> : null}

      <TabBar />
    </div>
  )
}
