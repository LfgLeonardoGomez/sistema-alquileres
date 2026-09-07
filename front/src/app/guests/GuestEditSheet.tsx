import { GUEST_EDIT_SHEET_COPY } from '../../shared/copy/guests'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, Sheet } from '../../shared/ui'
import type { Client } from '../reservations/useClients'
import { GuestForm } from './GuestForm'
import { useUpdateGuest } from './useUpdateGuest'

// Phase 7b (owner-waived TDD, 2026-09-06, `decisions/guest-edit-untested`):
// the "Editar" link's own destination (screen 10). Reuses `GuestForm.tsx`
// pre-filled with the guest's current name/phone -- `GuestForm` was
// deliberately kept mutation-agnostic by Phase 7 precisely so this could be
// wired without touching the component, `CabinEditSheet.tsx`'s own
// precedent for the identical composition on the cabin side.
//
// NOT TEST-COVERED. In particular: what the owner sees here when the typed
// phone already belongs to another active client (a PATCH that fails the
// backend's phone-uniqueness constraint, 409/`duplicate`) is UNVERIFIED --
// `resolveErrorCopy` already has a code-keyed sentence for `duplicate`
// ("Ese teléfono ya es de otro huésped.", confirmed against
// `back/app/errors.py`'s `23505` -> `duplicate` mapping), so this sheet
// reuses it rather than letting a raw error reach the screen, but nobody
// has clicked this path yet.

type Props = {
  readonly guest: Client
  readonly onClose: () => void
  readonly onSaved: () => void
}

export function GuestEditSheet({ guest, onClose, onSaved }: Props) {
  const updateGuest = useUpdateGuest()

  async function handleSubmit({ fullName, phone }: { fullName: string; phone: string }) {
    try {
      await updateGuest.mutateAsync({ guestId: guest.id, fullName, phone })
      onSaved()
    } catch {
      // Surfaced below via `.isError`/`.error`; the sheet stays open so she
      // can correct the input and try again, `CabinEditSheet.tsx`'s own
      // shape for a rename that fails.
    }
  }

  return (
    <Sheet>
      <div role="dialog" aria-label={GUEST_EDIT_SHEET_COPY.title} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold text-primary">{GUEST_EDIT_SHEET_COPY.title}</h2>

        <GuestForm
          initialFullName={guest.full_name}
          initialPhone={guest.phone}
          submitLabel={GUEST_EDIT_SHEET_COPY.save}
          onSubmit={(values) => void handleSubmit(values)}
        />

        {updateGuest.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(updateGuest.error)}
          </p>
        ) : null}

        <Button variant="secondary" onClick={onClose}>
          {GUEST_EDIT_SHEET_COPY.close}
        </Button>
      </div>
    </Sheet>
  )
}
