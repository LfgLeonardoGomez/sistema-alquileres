import { DEACTIVATE_CABIN_SHEET_COPY } from '../../shared/copy/cabins'
import { resolveErrorCopy } from '../../shared/errors/resolve'
import { Button, Sheet } from '../../shared/ui'
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
    <Sheet>
      <div role="dialog" aria-label={DEACTIVATE_CABIN_SHEET_COPY.title} className="flex flex-col gap-3.5">
        <h2 className="text-2xl font-extrabold tracking-tight text-primary">{DEACTIVATE_CABIN_SHEET_COPY.title}</h2>
        <p className="text-lg leading-normal text-secondary">{DEACTIVATE_CABIN_SHEET_COPY.body}</p>

        {deactivateCabin.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(deactivateCabin.error)}
          </p>
        ) : null}

        <Button variant="destructive" className="mt-2.5" onClick={() => void handleConfirm()}>
          {DEACTIVATE_CABIN_SHEET_COPY.confirm}
        </Button>
        <Button variant="secondary" className="bg-[#F2F2F8] text-secondary" onClick={onClose}>
          {DEACTIVATE_CABIN_SHEET_COPY.decline}
        </Button>
      </div>
    </Sheet>
  )
}
