import { DEACTIVATE_GUEST_SHEET_COPY } from '../../shared/copy/guests'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, Sheet } from '../../shared/ui'
import { useDeactivateGuest } from './useDeactivateGuest'

// task 7.13/7.14, `CancelSheet.tsx`'s own shape (task 6.10): a confirmation
// sheet before ANY request, never a browser dialog. Declining is a plain
// `onClose()` with no mutation reachable from that branch at all -- the
// structural half of "declining MUST send no request", the same guarantee
// `CancelSheet.tsx` gives cancellation.

type Props = {
  readonly guestId: string
  readonly onClose: () => void
  readonly onDeactivated: () => void
}

export function DeactivateGuestSheet({ guestId, onClose, onDeactivated }: Props) {
  const deactivateGuest = useDeactivateGuest()

  async function handleConfirm() {
    try {
      await deactivateGuest.mutateAsync({ guestId })
      onDeactivated()
    } catch {
      // Surfaced below via `.isError`/`.error`; the sheet stays open so she
      // can try again, `CancelSheet.tsx`'s own shape.
    }
  }

  return (
    <Sheet>
      <div role="dialog" aria-label={DEACTIVATE_GUEST_SHEET_COPY.title} className="flex flex-col gap-3.5">
        <h2 className="text-2xl font-extrabold tracking-tight text-primary">{DEACTIVATE_GUEST_SHEET_COPY.title}</h2>
        <p className="text-lg leading-normal text-secondary">{DEACTIVATE_GUEST_SHEET_COPY.body}</p>

        {deactivateGuest.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(deactivateGuest.error)}
          </p>
        ) : null}

        <Button variant="destructive" className="mt-2.5" onClick={() => void handleConfirm()}>
          {DEACTIVATE_GUEST_SHEET_COPY.confirm}
        </Button>
        <Button variant="secondary" className="bg-[#F2F2F8] text-secondary" onClick={onClose}>
          {DEACTIVATE_GUEST_SHEET_COPY.decline}
        </Button>
      </div>
    </Sheet>
  )
}
