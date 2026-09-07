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
import { nightsBetween } from '../../../shared/date/nightsBetween'
import { Button, fieldLabelClass, inputClass, navButtonClass, segmentedButtonClass, segmentedTrackClass } from '../../../shared/ui'
import { effectiveTotalCentavos } from '../effectiveTotal'
import { useCreatePayment } from '../useCreatePayment'
import { useCreateReservation } from '../useCreateReservation'
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

// Owner's live-review request (2026-09-07): "no me da la opción de anotar
// el monto que el cliente me pagó como seña de la reserva. Tengo que crear
// la reserva, guardarla, volver a abrir en huéspedes para ver la reserva y
// anotar un pago." The live OpenAPI has no field for an initial payment on
// `POST /reservations` -- payments only ever go to `POST
// /reservations/{id}/payments` -- so this step now chains the two calls
// instead of just the first one. `onSaved` grew an optional argument
// rather than a second callback prop: the two outcomes ("saved, deposit
// recorded or none entered" vs "saved, deposit failed") both end in the
// SAME action (leave the wizard, clear the draft), differing only in
// where they land and whether a message travels with them -- one callback,
// two shapes of the same call, matching this module's existing "one place
// decides" style (`updateMode`/`updateAmount` above).
export type PriceStepSavedOptions = {
  readonly path?: string
  readonly depositFailed?: boolean
}

type Props = {
  readonly cabin: WizardCabin
  readonly dates: WizardDates
  readonly guest: WizardGuest
  readonly initialPriceMode: WizardPriceMode | null
  readonly initialAmount: number | null
  readonly onBack: () => void
  readonly onPriceChange: (priceMode: WizardPriceMode, amountCentavos: number) => void
  readonly onSaved: (options?: PriceStepSavedOptions) => void
}

export function PriceStep({ cabin, dates, guest, initialPriceMode, initialAmount, onBack, onPriceChange, onSaved }: Props) {
  const [priceMode, setPriceMode] = useState<WizardPriceMode>(initialPriceMode ?? 'per_night')
  const [amountPesos, setAmountPesos] = useState<string>(initialAmount !== null ? String(Math.trunc(initialAmount / 100)) : '')
  const [depositPesos, setDepositPesos] = useState('')
  const createReservation = useCreateReservation()
  const createDeposit = useCreatePayment()

  const amountCentavos = amountPesos === '' ? 0 : Math.round(Number(amountPesos) * 100)
  const depositCentavos = depositPesos === '' ? 0 : Math.round(Number(depositPesos) * 100)
  const nights = nightsBetween(dates.checkIn, dates.checkOut)
  const totalCentavos = effectiveTotalCentavos(priceMode, amountCentavos, nights)

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
    let reservationId: string
    try {
      const reservation = await createReservation.mutateAsync({
        propertyId: cabin.id,
        clientId: guest.id,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        pricePerNightCentavos: priceMode === 'per_night' ? amountCentavos : null,
        priceTotalCentavos: priceMode === 'total' ? amountCentavos : null,
      })
      reservationId = reservation.id
    } catch {
      // `reservation-recording` spec "Saving Without Connectivity Fails
      // Visibly And Preserves The Draft": the failure is already surfaced
      // below via `createReservation.isError`/`.error`, and the draft is
      // preserved simply by NOT calling `onSaved()` (which is the only
      // path that clears it, 5.26/5.27). Caught here, rather than left
      // unhandled, only so a failed save is a visible message instead of
      // an unhandled promise rejection -- `mutateAsync` rethrows after
      // already updating the mutation's own state.
      return
    }

    // The reservation is real now -- nothing below this line may lose it.
    // No deposit typed behaves exactly as before this change (5.26/5.27
    // unchanged): straight to `onSaved()`, wizard leaves, draft clears.
    if (depositCentavos <= 0) {
      onSaved()
      return
    }

    try {
      await createDeposit.mutateAsync({
        reservationId,
        amountCentavos: depositCentavos,
        method: 'cash',
        note: null,
      })
      onSaved()
    } catch {
      // The owner's own decided rule: a reservation that saved but whose
      // deposit didn't must never be lost or silently swallowed. She lands
      // on the stay's own detail screen -- which already renders payments
      // and balance, and already has "Anotar un pago" -- with a message
      // telling her the deposit still needs to be added there.
      onSaved({ path: `/reserva/${reservationId}`, depositFailed: true })
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-page px-[18px] pt-16 pb-[26px]">
      <div className="mb-[22px] flex items-center gap-3.5">
        <button type="button" aria-label={RESERVATION_WIZARD_COPY.volver} className={navButtonClass} onClick={onBack}>
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </button>
        <div className="flex flex-col">
          <p className="text-[15px] font-extrabold text-faint-2">{wizardStepLabel(4)}</p>
          <h1 className="text-[22px] font-extrabold text-primary">{RESERVATION_WIZARD_COPY.priceStepTitle}</h1>
        </div>
      </div>
      <p role="note" className="mb-5 rounded-2xl bg-accent-tint px-[18px] py-3.5 text-[17px] font-bold text-accent-ink">
        {dateRangeContextBanner(cabin.name, formatDateRange(dates.checkIn, dates.checkOut), nights)}
      </p>

      <div
        role="group"
        aria-label={RESERVATION_WIZARD_COPY.priceStepTitle}
        className={`${segmentedTrackClass} mb-[22px]`}
      >
        <button
          type="button"
          aria-pressed={priceMode === 'per_night'}
          className={segmentedButtonClass(priceMode === 'per_night', 'h-[52px]')}
          onClick={() => updateMode('per_night')}
        >
          {RESERVATION_WIZARD_COPY.perNight}
        </button>
        <button
          type="button"
          aria-pressed={priceMode === 'total'}
          className={segmentedButtonClass(priceMode === 'total', 'h-[52px]')}
          onClick={() => updateMode('total')}
        >
          {RESERVATION_WIZARD_COPY.total}
        </button>
      </div>

      {/* Explicit `htmlFor`/`id` rather than nesting the input inside
          `<label>`: this field also renders a visible "$" prefix, and
          `getByLabelText`'s implicit-wrapper association matches on the
          label's WHOLE text content -- "Monto$", not "Monto" -- the moment
          a second text node shares that element. An explicit pairing
          decouples the accessible name from the field's visual layout. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="price-amount" className="text-base font-bold text-secondary">
          {RESERVATION_WIZARD_COPY.amountLabel}
        </label>
        <div className="flex h-[78px] items-center gap-2.5 rounded-field border border-input-border bg-surface px-5">
          <span aria-hidden="true" className="text-[28px] font-bold text-faint-2">
            {RESERVATION_WIZARD_COPY.currencySymbol}
          </span>
          <input
            id="price-amount"
            type="number"
            className="w-full text-[34px] font-extrabold tracking-tight text-primary focus:outline-none"
            value={amountPesos}
            onChange={(event) => updateAmount(event.target.value)}
          />
        </div>
      </div>

      {priceMode === 'per_night' ? (
        <>
          <div className="mt-[18px] flex items-baseline justify-between rounded-[20px] border border-card-border bg-surface p-5">
            <span className="text-lg font-bold text-muted">{RESERVATION_WIZARD_COPY.total}</span>
            <span className="text-[30px] font-extrabold tracking-tight text-primary">{formatMoney(totalCentavos)}</span>
          </div>
          <p className="px-1 pt-3 text-base leading-normal text-faint">{rescaleHelper(nights, formatMoney(amountCentavos))}</p>
        </>
      ) : null}

      {/* Not drawn in the handoff (screen 05 predates this request) --
          this run's own minimal field, deliberately the plain
          `fieldLabelClass`/`inputClass` pair (`PaymentSheet.tsx`'s own
          convention for a secondary money field) rather than the amount
          field's own large `$`-prefixed box above, so the required field
          stays visually primary and this optional one reads as secondary. */}
      <label htmlFor="price-deposit" className="mt-[18px] flex flex-col gap-2">
        <span className={fieldLabelClass}>{RESERVATION_WIZARD_COPY.depositLabel}</span>
        <input
          id="price-deposit"
          type="number"
          className={inputClass}
          value={depositPesos}
          onChange={(event) => setDepositPesos(event.target.value)}
        />
      </label>

      {createReservation.isError ? (
        <p role="alert" className="mt-3 text-base font-bold text-warm">
          {resolveErrorCopy(createReservation.error)}
        </p>
      ) : null}

      <div className="flex-1" />

      <Button variant="primary" className="h-[68px]" onClick={() => void handleSave()}>
        {RESERVATION_WIZARD_COPY.guardar}
      </Button>
    </div>
  )
}
