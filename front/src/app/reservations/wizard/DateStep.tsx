import { useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { YearMonth } from '../../../shared/calendar/monthGrid'
import { formatDayMonth, formatMonthYear } from '../../../shared/date/format'
import { nightsBetween } from '../../../shared/date/nightsBetween'
import type { PlainDate } from '../../../shared/date/parsePlainDate'
import { todayAR } from '../../../shared/date/todayAR'
import {
  RESERVATION_WIZARD_COPY,
  nightsCountLabel,
  occupiedNightsBanner,
  wizardStepLabel,
} from '../../../shared/copy/reservations'
import { Button, navButtonClass } from '../../../shared/ui'
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
    <div className="flex min-h-screen flex-col gap-[18px] bg-page px-[18px] pt-16 pb-5">
      <div className="flex items-center gap-3.5">
        <button type="button" aria-label={RESERVATION_WIZARD_COPY.volver} className={navButtonClass} onClick={onBack}>
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </button>
        <div className="flex flex-col">
          <p className="text-[15px] font-extrabold text-faint-2">{wizardStepLabel(2)}</p>
          <h1 className="text-[22px] font-extrabold text-primary">{RESERVATION_WIZARD_COPY.dateStepTitle}</h1>
        </div>
      </div>
      <p role="note" className="rounded-2xl bg-accent-tint px-[18px] py-3.5 text-[17px] font-bold text-accent-ink">
        {occupiedNightsBanner(cabin.name)}
      </p>

      <div role="group" aria-label={wizardStepLabel(2)} className="flex items-center justify-between px-1">
        <button
          type="button"
          aria-label={RESERVATION_WIZARD_COPY.previousMonth}
          className={navButtonClass}
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
        >
          {RESERVATION_WIZARD_COPY.previousMonthGlyph}
        </button>
        <h2 className="text-xl font-extrabold text-primary">{formatMonthYear(month)}</h2>
        <button
          type="button"
          aria-label={RESERVATION_WIZARD_COPY.nextMonth}
          className={navButtonClass}
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
        >
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

      {guardMessage !== null ? (
        <p role="alert" className="text-base font-bold text-warm">
          {guardMessage}
        </p>
      ) : null}

      <div className="flex-1" />

      {selectedRange !== null ? (
        <>
          <section
            aria-label={RESERVATION_WIZARD_COPY.resumenLabel}
            className="flex flex-col gap-1 rounded-[20px] border border-card-border bg-surface p-5"
          >
            <p className="text-xl font-extrabold text-primary">
              {RESERVATION_WIZARD_COPY.entradaLabel} {formatDayMonth(selectedRange.checkIn)} · {RESERVATION_WIZARD_COPY.salidaLabel}{' '}
              {formatDayMonth(selectedRange.checkOut)}
            </p>
            <p className="text-lg text-muted-2">{nightsCountLabel(nights)}</p>
          </section>
          <Button variant="primary" className="h-[66px]" onClick={() => onContinue(selectedRange)}>
            {RESERVATION_WIZARD_COPY.seguir}
          </Button>
        </>
      ) : null}
    </div>
  )
}
