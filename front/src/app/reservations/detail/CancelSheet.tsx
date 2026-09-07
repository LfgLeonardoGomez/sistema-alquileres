import { CANCEL_SHEET_COPY, cancelConfirmationBody } from '../../../shared/copy/reservations'
import { formatDateRange } from '../../../shared/date/format'
import type { PlainDate } from '../../../shared/date/parsePlainDate'
import { resolveErrorCopy } from '../../../shared/errors/resolve'
import { Button, Sheet } from '../../../shared/ui'
import { useCancelReservation } from '../useCancelReservation'

// task 6.10, handoff screen 07: a bottom sheet naming the range and the
// cabin, then "Sí, cancelar" / "No, dejarla como está".
//
// Declining sends NOTHING -- it is a plain `onClose()`, with no mutation
// reachable from that branch at all. That is the structural half of the
// spec's "declining MUST send no request": there is no request to
// accidentally fire, not merely a guard that happens to skip one.
//
// The body says "Los pagos anotados quedan guardados" and means it: the
// cancel endpoint touches `status` and nothing else, which is what makes
// 6.13's payments-survive proof a proof rather than a test.

type Props = {
  readonly reservationId: string
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
  readonly cabinName: string
  readonly onClose: () => void
}

export function CancelSheet({ reservationId, checkIn, checkOut, cabinName, onClose }: Props) {
  const cancelReservation = useCancelReservation()

  async function handleConfirm() {
    try {
      await cancelReservation.mutateAsync({ reservationId })
      onClose()
    } catch {
      // Surfaced below via `cancelReservation.isError`/`.error`; the sheet
      // stays open so she can try again, the same shape `PriceStep.tsx`
      // and `PaymentSheet.tsx` use.
    }
  }

  return (
    <Sheet>
      <div role="dialog" aria-label={CANCEL_SHEET_COPY.title} className="flex flex-col gap-3.5">
        <h2 className="text-2xl font-extrabold tracking-tight text-primary">{CANCEL_SHEET_COPY.title}</h2>
        <p className="text-lg leading-normal text-secondary">{cancelConfirmationBody(formatDateRange(checkIn, checkOut), cabinName)}</p>

        {cancelReservation.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(cancelReservation.error)}
          </p>
        ) : null}

        <Button variant="destructive" className="mt-2.5" onClick={() => void handleConfirm()}>
          {CANCEL_SHEET_COPY.confirm}
        </Button>
        <Button variant="secondary" className="bg-[#F2F2F8] text-secondary" onClick={onClose}>
          {CANCEL_SHEET_COPY.decline}
        </Button>
      </div>
    </Sheet>
  )
}
