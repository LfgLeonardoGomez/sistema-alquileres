import { useState } from 'react'
import { CABIN_EDIT_SHEET_COPY, CABIN_FORM_COPY } from '../../shared/copy/cabins'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import type { Cabin } from '../reservations/useCabins'
import { CabinForm } from './CabinForm'
import { DeactivateCabinSheet } from './DeactivateCabinSheet'
import { useRenameCabin } from './useRenameCabin'

// task 8.2/8.7/8.8, the screen 08 "Editar" link's own destination. Not
// drawn as its own surface in the handoff (screen 08 shows only the link
// itself) -- this run's own minimal, same-register invention, `GuestSheet.tsx`'s
// own precedent for an undrawn "tap a row" surface. Owns the rename
// mutation directly (`CabinForm` supplies only the input and, from 8.6 on,
// the blank-name guard) and is the entry point onto the deactivate sheet,
// exactly the composition `GuestSheet.tsx` already established for guests.

type Props = {
  readonly cabin: Cabin
  readonly onClose: () => void
}

export function CabinEditSheet({ cabin, onClose }: Props) {
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false)
  const renameCabin = useRenameCabin()

  async function handleRename({ name }: { readonly name: string }) {
    try {
      await renameCabin.mutateAsync({ cabinId: cabin.id, name })
    } catch {
      // Surfaced below via `.isError`/`.error`; the sheet stays open.
    }
  }

  return (
    <div role="dialog" aria-label={cabin.name}>
      <CabinForm initialName={cabin.name} submitLabel={CABIN_FORM_COPY.renameSubmit} onSubmit={(values) => void handleRename(values)} />

      {renameCabin.isError ? <p role="alert">{resolveErrorCopy(renameCabin.error)}</p> : null}

      <button type="button" onClick={() => setIsDeactivateOpen(true)}>
        {CABIN_EDIT_SHEET_COPY.deactivate}
      </button>
      <button type="button" onClick={onClose}>
        {CABIN_EDIT_SHEET_COPY.close}
      </button>

      {isDeactivateOpen ? (
        <DeactivateCabinSheet
          cabinId={cabin.id}
          onClose={() => setIsDeactivateOpen(false)}
          onDeactivated={() => {
            setIsDeactivateOpen(false)
            onClose()
          }}
        />
      ) : null}
    </div>
  )
}
