import { useEffect, useMemo, useState } from 'react'
import { Temporal } from 'temporal-polyfill'
import { env } from '../env'
import { intersectOccupancy } from '../shared/calendar/intersectOccupancy'
import { monthWindow, type YearMonth } from '../shared/calendar/monthGrid'
import type { DateRange } from '../shared/calendar/segments'
import { MONTH_NAMES, PUBLIC_COPY } from '../shared/copy/public'
import { todayAR } from '../shared/date/todayAR'
import type { ApiError } from '../shared/errors/ApiError'
import { resolveErrorCopy } from '../shared/errors/resolve'
import { getPublicAvailability, type PublicAvailability } from './api'
import { PublicMonthCalendar } from './PublicMonthCalendar'

// design D25/D28/D31: the public availability page. No auth, no wizard, no
// money -- the independently shippable slice. This module (and everything
// it imports) lives entirely under `src/public/` + `src/shared/`; it must
// never import from `src/app/**` (2.30's lint fixture proves the boundary
// fires on this exact file).

const BOTH_CABINS = '__both__'

function currentYearMonth(): YearMonth {
  const today = Temporal.PlainDate.from(todayAR())
  return { year: today.year, month: today.month }
}

function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const shifted = Temporal.PlainDate.from({ year, month, day: 1 }).add({ months: delta })
  return { year: shifted.year, month: shifted.month }
}

function rangesFor(cabin: PublicAvailability): DateRange[] {
  return cabin.occupied.map((range, index) => ({
    key: `${cabin.propertyId}-${index}`,
    start: range.checkIn,
    end: range.checkOut,
  }))
}

type Props = { readonly slug: string }

export function AvailabilityPage({ slug }: Props) {
  const [month, setMonth] = useState<YearMonth>(currentYearMonth)
  const [availability, setAvailability] = useState<readonly PublicAvailability[]>([])
  const [selectedCabin, setSelectedCabin] = useState<string>(BOTH_CABINS)
  const [error, setError] = useState<ApiError | null>(null)

  const year = month.year
  const monthNumber = month.month

  useEffect(() => {
    let cancelled = false
    const { start, end } = monthWindow({ year, month: monthNumber })

    getPublicAvailability(slug, { from: start, to: end })
      .then((result) => {
        if (cancelled) return
        setAvailability(result)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause as ApiError)
      })

    return () => {
      cancelled = true
    }
  }, [slug, year, monthNumber])

  const displayedRanges = useMemo<DateRange[]>(() => {
    if (selectedCabin === BOTH_CABINS) {
      const merged = intersectOccupancy(availability.map((cabin) => rangesFor(cabin)))
      return merged.map((range, index) => ({ key: `merged-${index}`, start: range.start, end: range.end }))
    }
    const cabin = availability.find((candidate) => candidate.name === selectedCabin)
    return cabin === undefined ? [] : rangesFor(cabin)
  }, [availability, selectedCabin])

  const monthLabel = `${MONTH_NAMES[monthNumber - 1]} ${year}`

  return (
    <div>
      <div role="group" aria-label={PUBLIC_COPY.filterLabel}>
        <button type="button" onClick={() => setSelectedCabin(BOTH_CABINS)}>
          {PUBLIC_COPY.bothCabins}
        </button>
        {availability.map((cabin) => (
          <button key={cabin.propertyId} type="button" onClick={() => setSelectedCabin(cabin.name)}>
            {cabin.name}
          </button>
        ))}
      </div>

      <div>
        <button type="button" aria-label={PUBLIC_COPY.previousMonth} onClick={() => setMonth((current) => shiftMonth(current, -1))}>
          {PUBLIC_COPY.previousMonthGlyph}
        </button>
        <span>{monthLabel}</span>
        <button type="button" aria-label={PUBLIC_COPY.nextMonth} onClick={() => setMonth((current) => shiftMonth(current, 1))}>
          {PUBLIC_COPY.nextMonthGlyph}
        </button>
      </div>

      <div>
        <span>{PUBLIC_COPY.legendFree}</span>
        <span>{PUBLIC_COPY.legendOccupied}</span>
      </div>

      {error !== null ? <p>{resolveErrorCopy(error)}</p> : <PublicMonthCalendar month={month} occupiedRanges={displayedRanges} />}

      {env.whatsappNumber !== undefined ? (
        <a href={`https://wa.me/${env.whatsappNumber}`}>{PUBLIC_COPY.whatsappButton}</a>
      ) : null}
    </div>
  )
}
