import { useState } from 'react'
import { RESERVATION_DETAIL_COPY } from '../../../shared/copy/reservations'
import { resolveErrorCopy } from '../../../shared/errors/resolve'
import { Button, fieldLabelClass, inputClass, segmentedButtonClass, segmentedTrackClass, Sheet } from '../../../shared/ui'
import { useCreatePayment } from '../useCreatePayment'
import type { PaymentMethod } from '../usePayments'

// task 6.8: "the two sheets share one form component, differing only in
// the sign applied before submit."
//
// That sentence is the whole design, and `mode` is the ONLY thing it
// switches on: the title, and the sign. Everything else -- the amount
// field, the method control, the endpoint, the encoding, the error
// presentation -- is literally the same code running twice, so "Anotar un
// pago" and "Devolución" cannot drift apart on anything except the one
// difference that is real.
//
// She types PESOS, never centavos -- the same convention `PriceStep.tsx`
// established (a `<input type="number">` whose value is multiplied by 100
// at the edge). The absolute value is what she enters in BOTH sheets: on
// the refund sheet she types `10000`, not `-10000`, because "Devolución"
// already says which direction it goes.

const METHODS: readonly { readonly value: PaymentMethod; readonly label: string }[] = [
  { value: 'cash', label: RESERVATION_DETAIL_COPY.methodCash },
  { value: 'transfer', label: RESERVATION_DETAIL_COPY.methodTransfer },
  { value: 'other', label: RESERVATION_DETAIL_COPY.methodOther },
]

type Props = {
  readonly reservationId: string
  readonly mode: 'payment' | 'refund'
  readonly onClose: () => void
}

export function PaymentSheet({ reservationId, mode, onClose }: Props) {
  const [amountPesos, setAmountPesos] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const createPayment = useCreatePayment()

  const title = mode === 'payment' ? RESERVATION_DETAIL_COPY.recordPayment : RESERVATION_DETAIL_COPY.refund

  async function handleSave() {
    const magnitude = amountPesos === '' ? 0 : Math.round(Math.abs(Number(amountPesos)) * 100)
    try {
      await createPayment.mutateAsync({
        reservationId,
        // THE one difference between the two sheets.
        amountCentavos: mode === 'refund' ? -magnitude : magnitude,
        method,
        note: note.trim() === '' ? null : note.trim(),
      })
      onClose()
    } catch {
      // Surfaced below via `createPayment.isError`/`.error` -- caught only
      // so a failed save is a visible sentence rather than an unhandled
      // promise rejection, the same shape `PriceStep.tsx` uses. The sheet
      // stays open with her amount still in it.
    }
  }

  return (
    <Sheet>
      <div role="dialog" aria-label={title} className="flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold text-primary">{title}</h2>

        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{RESERVATION_DETAIL_COPY.amountLabel}</span>
          <input
            className={inputClass}
            type="number"
            value={amountPesos}
            onChange={(event) => setAmountPesos(event.target.value)}
          />
        </label>

        <div role="group" aria-label={RESERVATION_DETAIL_COPY.methodLabel} className={segmentedTrackClass}>
          {METHODS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={method === option.value}
              className={segmentedButtonClass(method === option.value)}
              onClick={() => setMethod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{RESERVATION_DETAIL_COPY.noteLabel}</span>
          <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        {createPayment.isError ? (
          <p role="alert" className="text-base font-bold text-warm">
            {resolveErrorCopy(createPayment.error)}
          </p>
        ) : null}

        <Button variant="primary" onClick={() => void handleSave()}>
          {RESERVATION_DETAIL_COPY.guardar}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {RESERVATION_DETAIL_COPY.volver}
        </Button>
      </div>
    </Sheet>
  )
}
