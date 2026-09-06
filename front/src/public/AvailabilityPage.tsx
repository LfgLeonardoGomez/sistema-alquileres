import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import { intersectOccupancy } from '../shared/calendar/intersectOccupancy'
import { monthWindow, type YearMonth } from '../shared/calendar/monthGrid'
import type { DateRange } from '../shared/calendar/segments'
import { MONTH_NAMES, PUBLIC_COPY } from '../shared/copy/public'
import { todayAR } from '../shared/date/todayAR'
import type { ApiError } from '../shared/errors/ApiError'
import { resolveErrorCopy } from '../shared/errors/resolve'
import { getPublicAvailability, getPublicContact, type PublicAvailability } from './api'
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

export function AvailabilityPage() {
  // The slug enters the app only at the URL (design D31's public tree) --
  // never a prop, so this component cannot be mounted with a slug its own
  // URL does not carry (task 2.33/2.34). `routes.tsx` (2.32) is the only
  // route that ever mounts this component, and it always matches
  // `/disponibilidad/:slug`.
  const { slug: routeSlug } = useParams<{ slug: string }>()
  // `routes.tsx` (2.32) only ever mounts this component behind
  // `/disponibilidad/:slug`, so `routeSlug` is defined in every real
  // render; the fallback exists only to satisfy the type, never to paper
  // over a route this component was never mounted under.
  const slug = routeSlug ?? ''
  const [month, setMonth] = useState<YearMonth>(currentYearMonth)
  const [availability, setAvailability] = useState<readonly PublicAvailability[]>([])
  const [selectedCabin, setSelectedCabin] = useState<string>(BOTH_CABINS)
  const [error, setError] = useState<ApiError | null>(null)
  // design D37 (corrected) + the Phase 2 addendum's gap 2: the tenant's
  // WhatsApp number is per-tenant, from `GET /public/{slug}/contact` --
  // never a build-time global. `null` covers both "not yet loaded" and
  // "this tenant has none set" identically: both render no button, which
  // is a correct and complete answer either way (task 2.39).
  const [whatsapp, setWhatsapp] = useState<string | null>(null)

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

  useEffect(() => {
    let cancelled = false

    getPublicContact(slug)
      .then((contact) => {
        if (!cancelled) setWhatsapp(contact.whatsapp)
      })
      .catch(() => {
        // A contact-fetch failure renders no button -- the same complete
        // and correct answer as a tenant with no number set. There is no
        // build-time fallback to fall back to (task 2.39).
        if (!cancelled) setWhatsapp(null)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

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

      {whatsapp !== null ? <a href={`https://wa.me/${whatsapp}`}>{PUBLIC_COPY.whatsappButton}</a> : null}
    </div>
  )
}
