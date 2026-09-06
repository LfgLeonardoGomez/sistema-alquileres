import { useState } from 'react'
import { formatMoney } from '../../../shared/money/formatMoney'
import { resolveErrorCopy } from '../../../shared/errors/resolve'
import {
  RESERVATION_WIZARD_COPY,
  dateRangeContextBanner,
  rescaleHelper,
  wizardStepLabel,
} from '../../../shared/copy/reservations'
import { formatDateRange } from '../../../shared/date/format'
import { useCreateReservation } from '../useCreateReservation'
import { nightsBetween } from './DateStep'
import type { WizardCabin, WizardDates, WizardGuest, WizardPriceMode } from './store'

// task 5.20-5.23/5.26-5.31, handoff screen 05 ("paso 4 de 4"),
// `reservation-recording` spec "Price Entry Is Mutually Exclusive" + "A
// Per-Night Price Rescales On A Date Change; A Stay-Total Price Does Not".
//
// The live preview is read STRAIGHT from the `dates` prop on every render
// (never cached in local state) -- this is what makes 5.22's trap true "for
// free": Wizard.tsx remounts this component fresh from the current store
// state every time step 4 is reached, so extending the stay on step 2 and
// coming back here recomputes the total with no re-entry, while a
// stay-total amount is never multiplied by anything and is therefore
// naturally unaffected by the same date change.

type Props = {
  readonly cabin: WizardCabin
  readonly dates: WizardDates
  readonly guest: WizardGuest
  readonly initialPriceMode: WizardPriceMode | null
  readonly initialAmount: number | null
  readonly onBack: () => void
  readonly onPriceChange: (priceMode: WizardPriceMode, amountCentavos: number) => void
  readonly onSaved: () => void
}

export function PriceStep({ cabin, dates, guest, initialPriceMode, initialAmount, onBack, onPriceChange, onSaved }: Props) {
  const [priceMode, setPriceMode] = useState<WizardPriceMode>(initialPriceMode ?? 'per_night')
  const [amountPesos, setAmountPesos] = useState<string>(initialAmount !== null ? String(Math.trunc(initialAmount / 100)) : '')
  const createReservation = useCreateReservation()

  const amountCentavos = amountPesos === '' ? 0 : Math.round(Number(amountPesos) * 100)
  const nights = nightsBetween(dates.checkIn, dates.checkOut)
  const totalCentavos = priceMode === 'per_night' ? amountCentavos * nights : amountCentavos

  function updateMode(mode: WizardPriceMode) {
    setPriceMode(mode)
    onPriceChange(mode, amountCentavos)
  }

  function updateAmount(value: string) {
    setAmountPesos(value)
    const centavos = value === '' ? 0 : Math.round(Number(value) * 100)
    onPriceChange(priceMode, centavos)
  }

  async function handleSave() {
    try {
      await createReservation.mutateAsync({
        propertyId: cabin.id,
        clientId: guest.id,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        pricePerNightCentavos: priceMode === 'per_night' ? amountCentavos : null,
        priceTotalCentavos: priceMode === 'total' ? amountCentavos : null,
      })
      onSaved()
    } catch {
      // `reservation-recording` spec "Saving Without Connectivity Fails
      // Visibly And Preserves The Draft": the failure is already surfaced
      // below via `createReservation.isError`/`.error`, and the draft is
      // preserved simply by NOT calling `onSaved()` (which is the only
      // path that clears it, 5.26/5.27). Caught here, rather than left
      // unhandled, only so a failed save is a visible message instead of
      // an unhandled promise rejection -- `mutateAsync` rethrows after
      // already updating the mutation's own state.
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack}>
        {RESERVATION_WIZARD_COPY.volver}
      </button>
      <p>{wizardStepLabel(4)}</p>
      <h1>{RESERVATION_WIZARD_COPY.priceStepTitle}</h1>
      <p role="note">{dateRangeContextBanner(cabin.name, formatDateRange(dates.checkIn, dates.checkOut), nights)}</p>

      <div role="group" aria-label={RESERVATION_WIZARD_COPY.priceStepTitle}>
        <button type="button" aria-pressed={priceMode === 'per_night'} onClick={() => updateMode('per_night')}>
          {RESERVATION_WIZARD_COPY.perNight}
        </button>
        <button type="button" aria-pressed={priceMode === 'total'} onClick={() => updateMode('total')}>
          {RESERVATION_WIZARD_COPY.total}
        </button>
      </div>

      <label>
        {RESERVATION_WIZARD_COPY.amountLabel}
        <input
          type="number"
          value={amountPesos}
          onChange={(event) => updateAmount(event.target.value)}
        />
      </label>

      {priceMode === 'per_night' ? (
        <p>
          {RESERVATION_WIZARD_COPY.total} {formatMoney(totalCentavos)}
          <br />
          {rescaleHelper(nights, formatMoney(amountCentavos))}
        </p>
      ) : null}

      {createReservation.isError ? <p role="alert">{resolveErrorCopy(createReservation.error)}</p> : null}

      <button type="button" onClick={() => void handleSave()}>
        {RESERVATION_WIZARD_COPY.guardar}
      </button>
    </div>
  )
}
