import { useState } from 'react'
import { CABIN_DIRECTORY_COPY, CABIN_EDIT_SHEET_COPY, CABIN_FORM_COPY, occupiedNightsThisMonthLabel } from '../../shared/copy/cabins'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, rowClass, Sheet } from '../../shared/ui'
import { TabBar } from '../shell/TabBar'
import { useCabins, type Cabin } from '../reservations/useCabins'
import { CabinEditSheet } from './CabinEditSheet'
import { CabinForm } from './CabinForm'
import { useAddCabin } from './useAddCabin'
import { occupiedNightsFor, useDashboardSummary } from './useDashboardSummary'

// Screen 08's own two-cabin dot rotation (accent purple, then green) --
// colour lives here, in `app/cabins/`, the same D28 boundary
// `app/calendar/pastels.ts` observes: the geometry-only pieces stay in
// `shared/`, the actual hex choices stay next to the domain that owns them.
const DOT_CLASS = ['bg-accent-soft-2', 'bg-green-dot', 'bg-warm-dot'] as const

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
    <div className="flex min-h-screen flex-col bg-page">
      <div className="flex flex-1 flex-col gap-[18px] px-5 pt-16 pb-5">
        <h1 className="text-[30px] font-extrabold tracking-tight text-primary">{CABIN_DIRECTORY_COPY.title}</h1>

        <ul className="flex flex-col gap-[18px]">
          {(cabins.data ?? []).map((cabin, index) => (
            <li
              key={cabin.id}
              data-tone={cabin.is_active ? undefined : 'muted'}
              className={`${rowClass} py-[22px] data-[tone=muted]:opacity-50`}
            >
              <span className={`h-3.5 w-3.5 shrink-0 rounded-pill ${DOT_CLASS[index % DOT_CLASS.length]}`} />
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-xl font-extrabold text-primary">{cabin.name}</span>
                <span className="text-base text-muted-2">{occupiedNightsThisMonthLabel(occupiedNightsFor(dashboard.data?.properties, cabin.id))}</span>
              </div>
              <button type="button" className="text-[17px] font-bold text-accent-ink" onClick={() => setEditingCabin(cabin)}>
                {CABIN_DIRECTORY_COPY.edit}
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="flex h-[62px] items-center justify-center rounded-btn-sm border-2 border-dashed border-[#D6D7E6] text-lg font-bold text-muted"
          onClick={() => setIsAddOpen(true)}
        >
          {CABIN_DIRECTORY_COPY.addCabin}
        </button>
        <div className="flex-1" />
        <p className="px-1 text-base leading-normal text-faint">{CABIN_DIRECTORY_COPY.footnote}</p>

        {isAddOpen ? (
          <Sheet>
            <div role="dialog" aria-label={CABIN_DIRECTORY_COPY.addCabin} className="flex flex-col gap-4">
              <CabinForm submitLabel={CABIN_FORM_COPY.addSubmit} onSubmit={(values) => void handleAdd(values)} />
              {addCabin.isError ? (
                <p role="alert" className="text-base font-bold text-warm">
                  {resolveErrorCopy(addCabin.error)}
                </p>
              ) : null}
              <Button variant="secondary" onClick={() => setIsAddOpen(false)}>
                {CABIN_EDIT_SHEET_COPY.close}
              </Button>
            </div>
          </Sheet>
        ) : null}

        {editingCabin !== null ? <CabinEditSheet cabin={editingCabin} onClose={() => setEditingCabin(null)} /> : null}
      </div>

      <TabBar />
    </div>
  )
}
