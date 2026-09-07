import { DEACTIVATE_CABIN_SHEET_COPY } from '../../shared/copy/cabins'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { useDeactivateCabin } from './useDeactivateCabin'

// task 8.1/8.3/8.4, `DeactivateGuestSheet.tsx`'s own shape (7.13/7.14): a
// confirmation sheet before ANY request, never a browser dialog. Declining
// is a plain `onClose()` with no mutation reachable from that branch at
// all -- the structural half of the spec's "declining MUST send no
// request", confirmed by this exact same pattern already proven at 7.14.

type Props = {
  readonly cabinId: string
  readonly onClose: () => void
  readonly onDeactivated: () => void
}

export function DeactivateCabinSheet({ cabinId, onClose, onDeactivated }: Props) {
  const deactivateCabin = useDeactivateCabin()

  async function handleConfirm() {
    try {
      await deactivateCabin.mutateAsync({ cabinId })
      onDeactivated()
    } catch {
      // Surfaced below via `.isError`/`.error`; the sheet stays open so she
      // can try again, `DeactivateGuestSheet.tsx`'s own shape.
    }
  }

  return (
    <div role="dialog" aria-label={DEACTIVATE_CABIN_SHEET_COPY.title}>
      <h2>{DEACTIVATE_CABIN_SHEET_COPY.title}</h2>
      <p>{DEACTIVATE_CABIN_SHEET_COPY.body}</p>

      {deactivateCabin.isError ? <p role="alert">{resolveErrorCopy(deactivateCabin.error)}</p> : null}

      <button type="button" onClick={() => void handleConfirm()}>
        {DEACTIVATE_CABIN_SHEET_COPY.confirm}
      </button>
      <button type="button" onClick={onClose}>
        {DEACTIVATE_CABIN_SHEET_COPY.decline}
      </button>
    </div>
  )
}
