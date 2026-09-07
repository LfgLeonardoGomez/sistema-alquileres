import { DEACTIVATE_GUEST_SHEET_COPY } from '../../shared/copy/guests'
import { resolveErrorCopy } from '../../shared/errors/resolve'
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
    <div role="dialog" aria-label={DEACTIVATE_GUEST_SHEET_COPY.title}>
      <h2>{DEACTIVATE_GUEST_SHEET_COPY.title}</h2>
      <p>{DEACTIVATE_GUEST_SHEET_COPY.body}</p>

      {deactivateGuest.isError ? <p role="alert">{resolveErrorCopy(deactivateGuest.error)}</p> : null}

      <button type="button" onClick={() => void handleConfirm()}>
        {DEACTIVATE_GUEST_SHEET_COPY.confirm}
      </button>
      <button type="button" onClick={onClose}>
        {DEACTIVATE_GUEST_SHEET_COPY.decline}
      </button>
    </div>
  )
}
