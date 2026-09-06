import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import type { YearMonth } from '../../../shared/calendar/monthGrid'
import {
  RESERVATION_DETAIL_COPY,
  RESERVATION_EDIT_COPY,
  RESERVATION_WIZARD_COPY,
  editDatesUnavailable,
  nightListPhrase,
  nightsCountLabel,
  occupiedNightsBanner,
  rescaleHelper,
} from '../../../shared/copy/reservations'
import { formatDayMonth } from '../../../shared/date/format'
import { resolveErrorCopy } from '../../../shared/errors/resolve'
import { formatMoney } from '../../../shared/money/formatMoney'
import { nightsBetween } from '../../../shared/date/nightsBetween'
import type { PlainDate } from '../../../shared/date/parsePlainDate'
import { balanceLine } from '../balanceLine'
import { displayBalance } from '../displayBalance'
import { effectiveTotalCentavos, type PriceMode } from '../effectiveTotal'
import { nightsInRange, occupiedNightsFor } from '../occupancy'
import { useCabins } from '../useCabins'
import { useReservation, type ReservationDetail } from '../useReservation'
import { useReservationsForCabin } from '../useReservationsForCabin'
import { useUpdateReservation } from '../useUpdateReservation'
import { RangePickerCalendar } from '../wizard/RangePickerCalendar'

// tasks 6.16-6.31, design D34 -- editing a saved reservation.
//
// **A full screen at `/reserva/:id/editar`, not a bottom sheet.** D34's own
// words: "The handoff uses bottom sheets for confirmations and short forms;
// an editor carrying a month grid does not fit a sheet on an 874 px phone."
//
// **Only dates and price.** `ReservationUpdate` accepts `check_in`,
// `check_out`, `price_per_night` and `price_total` and nothing else, so
// there is no cabin control and no guest control on this screen -- not a
// disabled one, none at all. The same subtraction pattern this codebase
// uses everywhere (`ApiError` without `detail`, `PrivateMonthCalendar`
// without an `onClick` prop): a control that does not exist cannot send a
// field the API would reject.
//
// The picker itself is 5.9/5.11's `RangePickerCalendar`, reused rather than
// reimplemented -- adjacency (a range may END on another stay's check-in
// day) is the change's central subtlety and must not acquire a second
// implementation here.

type Props = {
  readonly stay: ReservationDetail
  readonly cabinName: string
}

const MAX_NIGHTS = 60

function monthOf(date: PlainDate): YearMonth {
  const parsed = Temporal.PlainDate.from(date)
  return { year: parsed.year, month: parsed.month }
}

function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const shifted = Temporal.PlainDate.from({ year: month.year, month: month.month, day: 1 }).add({ months: delta })
  return { year: shifted.year, month: shifted.month }
}

function initialPriceMode(stay: ReservationDetail): PriceMode {
  return stay.pricePerNightCentavos !== null ? 'per_night' : 'total'
}

function initialAmountPesos(stay: ReservationDetail): string {
  const centavos = stay.pricePerNightCentavos ?? stay.priceTotalCentavos ?? 0
  return String(Math.trunc(centavos / 100))
}

function EditReservationForm({ stay, cabinName }: Props) {
  const [month, setMonth] = useState<YearMonth>(() => monthOf(stay.checkIn))
  const [pendingEntrada, setPendingEntrada] = useState<PlainDate | null>(null)
  const [dates, setDates] = useState({ checkIn: stay.checkIn, checkOut: stay.checkOut })
  const [guardMessage, setGuardMessage] = useState<string | null>(null)
  const [priceMode, setPriceMode] = useState<PriceMode>(() => initialPriceMode(stay))
  const [amountPesos, setAmountPesos] = useState<string>(() => initialAmountPesos(stay))

  const navigate = useNavigate()
  const cabinStays = useReservationsForCabin(stay.propertyId)
  const updateReservation = useUpdateReservation()
  // D30: cancelled stays are filtered out of every occupancy computation.
  const activeStays = (cabinStays.data ?? []).filter((reservation) => reservation.status !== 'cancelled')
  // D34, the whole reason `excludeReservationId` has no default: the server
  // never conflicts a row with itself (`EXCLUDE USING gist` compares
  // DISTINCT rows), so a picker that painted R's own nights grey would make
  // a one-day shift impossible with no explanation on screen.
  const occupiedNights = occupiedNightsFor(
    activeStays.map((reservation) => ({
      id: reservation.id,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
    })),
    { excludeReservationId: stay.id },
  )

  function handleEntradaSelected(date: PlainDate) {
    setPendingEntrada(date)
    setGuardMessage(null)
  }

  function handleRangeAttempt(entrada: PlainDate, salida: PlainDate) {
    const nights = nightsBetween(entrada, salida)
    setPendingEntrada(null)

    // The same two client-side count guards `DateStep.tsx` applies to a new
    // stay (D28's "Also client-side" sentence). Beyond this task's literal
    // text, and recorded as such -- but `RangePickerCalendar` reports EVERY
    // completed second tap upward, including a zero-night double tap, so
    // without them the screen could offer to save a stay of no nights.
    if (nights <= 0) {
      setGuardMessage(RESERVATION_WIZARD_COPY.zeroNightsGuard)
      return
    }
    if (nights > MAX_NIGHTS) {
      setGuardMessage(RESERVATION_WIZARD_COPY.tooManyNightsGuard)
      return
    }

    setGuardMessage(null)
    setDates({ checkIn: entrada, checkOut: salida })
  }

  const nights = nightsBetween(dates.checkIn, dates.checkOut)
  const amountCentavos = amountPesos === '' ? 0 : Math.round(Number(amountPesos) * 100)
  // 5.23's rule, REUSED rather than reimplemented (6.25): the total is
  // recomputed from the CURRENT `dates` on every render, never cached in
  // state, which is what makes the rescale free -- extending the stay
  // re-renders, and the multiplication simply happens again with the new
  // night count. A stay total is never multiplied, so the same date change
  // leaves it exactly where it was.
  const totalCentavos = effectiveTotalCentavos(priceMode, amountCentavos, nights)
  // D34: lowering a price below what has already been paid is ALLOWED,
  // with no guard and no confirmation -- deliberately no validation here,
  // because the spec omits it deliberately. What the screen owes her is
  // not a block but a preview: `displayBalance()` (4.18) and `balanceLine`
  // (6.2) are the SAME two helpers the detail screen reads a saved stay
  // with, so what she sees before saving is what she will see after.
  const previewBalanceCentavos = displayBalance({
    status: stay.status,
    balance: totalCentavos - stay.paidAmountCentavos,
  })
  const previewDirection = balanceLine(previewBalanceCentavos)

  // 6.28/6.29, D32's resolution step 1. The server is the only party that
  // knows whether the cabin is free -- her own list was correct when it was
  // fetched, which is why the picker let her choose these nights at all --
  // so a `409 dates_unavailable` here is news, and the message has to carry
  // the news rather than repeat the wizard's "elegí otras".
  //
  // It can, because 6.12's shared factory invalidates on `onSettled`
  // (failures included, deliberately): the refused write refetches the
  // cabin's stay list, so by the time this renders `occupiedNights` knows
  // about the stay that beat her to it and the free nights below are the
  // real remainder rather than a stale guess.
  const freeNightsOfRequest = nightsInRange(dates.checkIn, dates.checkOut).filter(
    (night) => !occupiedNights.has(night),
  )
  const conflictCopy =
    updateReservation.error?.code === 'dates_unavailable'
      ? editDatesUnavailable(
          cabinName,
          freeNightsOfRequest.length === 0 ? null : nightListPhrase(freeNightsOfRequest.map(formatDayMonth)),
        )
      : undefined

  async function handleSave() {
    try {
      await updateReservation.mutateAsync({
        reservationId: stay.id,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        // The segmented control drives exactly one of the two, and the
        // OTHER is sent as an explicit `null` -- never omitted (D34/6.23).
        // There is no third code path in which both could be non-null.
        pricePerNightCentavos: priceMode === 'per_night' ? amountCentavos : null,
        priceTotalCentavos: priceMode === 'total' ? amountCentavos : null,
      })
      // Only on success -- a rejected `mutateAsync` throws past this line,
      // so a failed edit leaves her on this screen with her selection
      // intact and the reason on it (6.28/6.29).
      void navigate(`/reserva/${stay.id}`)
    } catch {
      // Surfaced below via `updateReservation.isError`/`.error` -- caught
      // only so a failed save is a visible sentence rather than an
      // unhandled promise rejection (`mutateAsync` rethrows after updating
      // the mutation's own state), the same shape `PriceStep.tsx`,
      // `PaymentSheet.tsx` and `CancelSheet.tsx` already use.
    }
  }

  return (
    <div>
      <Link to={`/reserva/${stay.id}`}>{RESERVATION_DETAIL_COPY.volver}</Link>
      <h1>{RESERVATION_EDIT_COPY.title}</h1>
      <p role="note">{occupiedNightsBanner(cabinName)}</p>

      <div role="group" aria-label={RESERVATION_WIZARD_COPY.dateStepTitle}>
        <button
          type="button"
          aria-label={RESERVATION_WIZARD_COPY.previousMonth}
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
        >
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </button>
        <button
          type="button"
          aria-label={RESERVATION_WIZARD_COPY.nextMonth}
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
        >
          {RESERVATION_WIZARD_COPY.nextMonthGlyph}
        </button>
      </div>

      <RangePickerCalendar
        month={month}
        occupiedNights={occupiedNights}
        pendingEntrada={pendingEntrada}
        selectedRange={dates}
        onEntradaSelected={handleEntradaSelected}
        onRangeAttempt={handleRangeAttempt}
      />

      {guardMessage !== null ? <p role="alert">{guardMessage}</p> : null}

      <section aria-label={RESERVATION_WIZARD_COPY.resumenLabel}>
        <p>
          {RESERVATION_WIZARD_COPY.entradaLabel} {formatDayMonth(dates.checkIn)} · {RESERVATION_WIZARD_COPY.salidaLabel}{' '}
          {formatDayMonth(dates.checkOut)}
        </p>
        <p>{nightsCountLabel(nights)}</p>
      </section>

      <div role="group" aria-label={RESERVATION_WIZARD_COPY.priceStepTitle}>
        <button type="button" aria-pressed={priceMode === 'per_night'} onClick={() => setPriceMode('per_night')}>
          {RESERVATION_WIZARD_COPY.perNight}
        </button>
        <button type="button" aria-pressed={priceMode === 'total'} onClick={() => setPriceMode('total')}>
          {RESERVATION_WIZARD_COPY.total}
        </button>
      </div>

      <label>
        {RESERVATION_WIZARD_COPY.amountLabel}
        <input type="number" value={amountPesos} onChange={(event) => setAmountPesos(event.target.value)} />
      </label>

      {/* D34: "The rescale rule is SHOWN, not inferred... Otherwise she
          extends a stay by one night and the total either moves or fails to
          move without her having asked for either." */}
      <section aria-label={RESERVATION_DETAIL_COPY.totalLabel}>
        <p>
          <span>{RESERVATION_DETAIL_COPY.totalLabel}</span> <span>{formatMoney(totalCentavos)}</span>
        </p>
        {priceMode === 'per_night' ? <p>{rescaleHelper(nights, formatMoney(amountCentavos))}</p> : null}
        <p>
          <span>{RESERVATION_DETAIL_COPY.paidLabel}</span> <span>{formatMoney(stay.paidAmountCentavos)}</span>
        </p>
        <p>
          {/* The ABSOLUTE amount, the direction carried by the sentence
              beside it -- never a literal `-$` (6.2's own rule). */}
          <span>{RESERVATION_DETAIL_COPY.saldoLabel}</span> <span>{formatMoney(Math.abs(previewBalanceCentavos))}</span>
        </p>
        {previewDirection !== null ? <p>{previewDirection}</p> : null}
      </section>

      {updateReservation.isError ? <p role="alert">{resolveErrorCopy(updateReservation.error, conflictCopy)}</p> : null}

      <button type="button" onClick={() => void handleSave()}>
        {RESERVATION_EDIT_COPY.guardar}
      </button>
    </div>
  )
}

export function EditReservation() {
  const { id = null } = useParams<{ id: string }>()
  const reservation = useReservation(id)
  const cabins = useCabins()

  if (reservation.data === undefined) return null

  const stay = reservation.data

  // D34's SECOND place, and the whole reason it says "in two places,
  // because a hidden button is not a closed route": 6.15 hides the edit
  // affordance on a cancelled stay's detail view, which does nothing about
  // a bookmark, a back button or a tab left open since before the
  // cancellation. The API would accept the PATCH -- it does not check
  // status, and a cancelled row sits outside the `EXCLUDE` predicate, so
  // ANY dates would pass -- so this guard is the only thing preventing it.
  //
  // `replace`, not a push: the URL she was redirected out of must not be
  // one back-button press away.
  //
  // It redirects to the ORDINARY detail screen, deliberately: Phase 6c
  // (6.32-6.44) made a cancelled stay that still holds money carry a
  // reminder and a reachable "Devolución", and that is exactly where
  // someone who just tried to edit a cancelled stay should land. Sending
  // her anywhere emptier would close the only route she has to record
  // giving the money back.
  if (stay.status === 'cancelled') return <Navigate to={`/reserva/${stay.id}`} replace />

  const cabinName = cabins.data?.find((cabin) => cabin.id === stay.propertyId)?.name ?? ''

  // The form is a separate component on purpose: every piece of edit state
  // (the displayed month, the in-progress selection, the price mode) belongs
  // to a LOADED stay, and React's rules of hooks forbid declaring it above
  // the `reservation.data === undefined` gate. Mounting the form only once
  // the stay is in hand also means its `useState` initialisers read real
  // values rather than placeholders they would then have to be reset from.
  return <EditReservationForm stay={stay} cabinName={cabinName} />
}
