import { useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { YearMonth } from '../../../shared/calendar/monthGrid'
import { formatDayMonth } from '../../../shared/date/format'
import type { PlainDate } from '../../../shared/date/parsePlainDate'
import { todayAR } from '../../../shared/date/todayAR'
import {
  RESERVATION_WIZARD_COPY,
  nightsCountLabel,
  occupiedNightsBanner,
  wizardStepLabel,
} from '../../../shared/copy/reservations'
import { occupiedNightsFor } from '../occupancy'
import { useReservationsForCabin } from '../useReservationsForCabin'
import { RangePickerCalendar } from './RangePickerCalendar'
import type { WizardCabin, WizardDates } from './store'

// task 5.8-5.15, `reservation-recording` spec: "Availability Is Shown
// Before Dates Are Requested", "Adjacency Is A Legal Selection", "Past
// Dates Are Freely Selectable With No Warning". This component owns the
// count guard (zero/60+ nights, D28's "also client-side" sentence) --
// `RangePickerCalendar` itself gates ONLY on occupancy.
//
// Deliberately absent from this whole file: any comparison against
// `todayAR()` or any other notion of "now". Task 5.12/5.13's requirement
// ("a range entirely in the past proceeds identically to a future range")
// is met structurally, the same subtraction pattern this codebase already
// uses (`PrivateMonthCalendar`'s missing `onClick`, `ApiError`'s missing
// `detail`): there is no code path here that COULD branch on today, not
// merely one that happens not to.

const MAX_NIGHTS = 60

function monthOf(date: PlainDate): YearMonth {
  const parsed = Temporal.PlainDate.from(date)
  return { year: parsed.year, month: parsed.month }
}

// Exported for `PriceStep.tsx`'s own live rescale (5.22/5.23) -- the exact
// same night count, never a second, independently-written computation that
// could drift from this one.
export function nightsBetween(checkIn: PlainDate, checkOut: PlainDate): number {
  return Temporal.PlainDate.from(checkIn).until(Temporal.PlainDate.from(checkOut)).days
}

function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const shifted = Temporal.PlainDate.from({ year: month.year, month: month.month, day: 1 }).add({ months: delta })
  return { year: shifted.year, month: shifted.month }
}

type Props = {
  readonly cabin: WizardCabin
  readonly initialDates: WizardDates | null
  readonly onContinue: (dates: WizardDates) => void
  readonly onBack: () => void
}

export function DateStep({ cabin, initialDates, onContinue, onBack }: Props) {
  const [month, setMonth] = useState<YearMonth>(() => monthOf(initialDates?.checkIn ?? todayAR()))
  const [pendingEntrada, setPendingEntrada] = useState<PlainDate | null>(null)
  const [selectedRange, setSelectedRange] = useState<WizardDates | null>(initialDates)
  const [guardMessage, setGuardMessage] = useState<string | null>(null)

  const reservations = useReservationsForCabin(cabin.id)
  // D30: cancelled stays are filtered out of every occupancy computation.
  const activeStays = (reservations.data ?? []).filter((reservation) => reservation.status !== 'cancelled')
  const occupiedNights = occupiedNightsFor(
    activeStays.map((stay) => ({ id: stay.id, checkIn: stay.checkIn, checkOut: stay.checkOut })),
    // 5.6/5.7, D34: the create wizard writes `null` in full -- there is no
    // reservation of its own to exclude yet.
    { excludeReservationId: null },
  )

  function handleEntradaSelected(date: PlainDate) {
    setPendingEntrada(date)
    setSelectedRange(null)
    setGuardMessage(null)
  }

  function handleRangeAttempt(entrada: PlainDate, salida: PlainDate) {
    const nights = nightsBetween(entrada, salida)
    setPendingEntrada(null)

    if (nights <= 0) {
      setGuardMessage(RESERVATION_WIZARD_COPY.zeroNightsGuard)
      setSelectedRange(null)
      return
    }
    if (nights > MAX_NIGHTS) {
      setGuardMessage(RESERVATION_WIZARD_COPY.tooManyNightsGuard)
      setSelectedRange(null)
      return
    }

    setGuardMessage(null)
    setSelectedRange({ checkIn: entrada, checkOut: salida })
  }

  const nights = selectedRange !== null ? nightsBetween(selectedRange.checkIn, selectedRange.checkOut) : 0

  return (
    <div>
      <button type="button" onClick={onBack}>
        {RESERVATION_WIZARD_COPY.volver}
      </button>
      <p>{wizardStepLabel(2)}</p>
      <h1>{RESERVATION_WIZARD_COPY.dateStepTitle}</h1>
      <p role="note">{occupiedNightsBanner(cabin.name)}</p>

      <div role="group" aria-label={wizardStepLabel(2)}>
        <button type="button" aria-label={RESERVATION_WIZARD_COPY.previousMonth} onClick={() => setMonth((current) => shiftMonth(current, -1))}>
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </button>
        <button type="button" aria-label={RESERVATION_WIZARD_COPY.nextMonth} onClick={() => setMonth((current) => shiftMonth(current, 1))}>
          {RESERVATION_WIZARD_COPY.nextMonthGlyph}
        </button>
      </div>

      <RangePickerCalendar
        month={month}
        occupiedNights={occupiedNights}
        pendingEntrada={pendingEntrada}
        selectedRange={selectedRange}
        onEntradaSelected={handleEntradaSelected}
        onRangeAttempt={handleRangeAttempt}
      />

      {guardMessage !== null ? <p role="alert">{guardMessage}</p> : null}

      {selectedRange !== null ? (
        <section aria-label={RESERVATION_WIZARD_COPY.resumenLabel}>
          <p>
            {RESERVATION_WIZARD_COPY.entradaLabel} {formatDayMonth(selectedRange.checkIn)} · {RESERVATION_WIZARD_COPY.salidaLabel}{' '}
            {formatDayMonth(selectedRange.checkOut)}
          </p>
          <p>{nightsCountLabel(nights)}</p>
          <button type="button" onClick={() => onContinue(selectedRange)}>
            {RESERVATION_WIZARD_COPY.seguir}
          </button>
        </section>
      ) : null}
    </div>
  )
}
