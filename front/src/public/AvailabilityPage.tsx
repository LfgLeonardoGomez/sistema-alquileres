import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import { intersectOccupancy } from '../shared/calendar/intersectOccupancy'
import { monthWindow, type YearMonth } from '../shared/calendar/monthGrid'
import type { DateRange } from '../shared/calendar/segments'
import { cabinPhotoLabel, MONTH_NAMES, PUBLIC_COPY } from '../shared/copy/public'
import { todayAR } from '../shared/date/todayAR'
import type { ApiError } from '../shared/errors/ApiError'
import { resolveErrorCopy } from '../shared/errors/resolve'
import {
  navButtonClass,
  pillButtonClass,
  pillRowClass,
  segmentedButtonClass,
  segmentedTrackClass,
} from '../shared/ui'
import { useIsDesktop } from '../shared/viewport/useIsDesktop'
import { getPublicAvailability, getPublicContact, type PublicAvailability } from './api'
import { PublicMonthCalendar } from './PublicMonthCalendar'

// Screen 11/12's own striped placeholder, README: "Currently striped
// placeholders labelled 'foto casa azul', 'foto dos aguas' -- replace with
// real photos." No photo asset ships with this change (Assets: "None
// shipped"); this decorative tile is the exact visual stand-in the handoff
// draws, `aria-hidden` because it carries no information a screen reader
// could act on.
//
// The 110px -> 200px height step is pure CSS reflow -- no accessible
// name/role is attached to this element, so there is no duplicate-query
// hazard the way there is for the filter buttons or the WhatsApp link
// below, and it can stay a plain additive breakpoint class instead of an
// `isDesktop` branch.
function PhotoPlaceholder({ label }: { readonly label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[110px] items-end rounded-2xl bg-[repeating-linear-gradient(135deg,#F2F2F8_0px,#F2F2F8_8px,#EAEAF3_8px,#EAEAF3_16px)] p-2.5 font-mono text-xs text-[#8A8CA0] lg:h-[200px] lg:rounded-[18px] lg:p-3.5 lg:text-[13px]"
    >
      {label}
    </div>
  )
}

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
  // design decision (screen 12, desktop pass): the ONLY JS-observable signal
  // this component needs. It drives two independent things, both explained
  // at their own call sites below: (1) how wide a window to fetch, and (2)
  // which one of a mobile/desktop control pair to mount, for the two
  // controls (filter, WhatsApp link) whose accessible name would otherwise
  // collide if both were mounted at once. Everything else that differs
  // between breakpoints (month-panel layout, the photo-tile grid's column
  // count) is pure CSS `lg:` reflow -- see PhotoPlaceholder's own comment
  // for why those two categories are treated differently.
  const isDesktop = useIsDesktop()

  const year = month.year
  const monthNumber = month.month

  useEffect(() => {
    let cancelled = false
    // Desktop shows two months side by side (README: screen 12), and both
    // must come from the SAME response -- rendering a second
    // `PublicMonthCalendar` for `month + 1` while only ever fetching
    // `month`'s own window is exactly the "public page lying about
    // availability" failure this widening exists to prevent. Mobile's
    // window is untouched: `monthWindow(month)` alone, one calendar month,
    // matching this effect's behaviour before this pass (pinned by
    // `AvailabilityPage.test.tsx`'s "sends both from and to on the first
    // request on mount" and "re-issues a request for October window" --
    // both assert a single-month window and were written before desktop
    // existed).
    const { start } = monthWindow({ year, month: monthNumber })
    const { end } = isDesktop
      ? monthWindow(shiftMonth({ year, month: monthNumber }, 1))
      : monthWindow({ year, month: monthNumber })

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
    // `isDesktop` is a real dependency, not an oversight: crossing the `lg:`
    // breakpoint while mounted (a live window resize) must re-fetch with the
    // newly-correct window span, not keep serving the old one.
  }, [slug, year, monthNumber, isDesktop])

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
  // The desktop-only second panel. `computeSegments` (shared/calendar/
  // segments.ts) already filters `displayedRanges` down to whichever
  // month's grid it is called for, so the SAME full range list -- now
  // correctly spanning both months, above -- is the right thing to hand to
  // both calendars; no per-month splitting needed here.
  const secondMonth = shiftMonth({ year, month: monthNumber }, 1)
  const secondMonthLabel = `${MONTH_NAMES[secondMonth.month - 1]} ${secondMonth.year}`

  // Same options, two visual treatments (README: "segmented on phone, pills
  // on desktop"). Built once so neither variant below can drift from the
  // other's option list.
  const cabinOptions = [
    { key: BOTH_CABINS, label: PUBLIC_COPY.bothCabins },
    ...availability.map((cabin) => ({ key: cabin.name, label: cabin.name })),
  ]

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col gap-[18px] bg-white px-5 pt-16 pb-[120px] lg:max-w-[1120px] lg:gap-[30px] lg:px-14 lg:pb-16">
      <div className="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="flex flex-col gap-1">
          <div className="text-[28px] font-extrabold tracking-tight text-primary">{PUBLIC_COPY.title}</div>
          <div className="text-lg text-muted">{PUBLIC_COPY.subtitle}</div>
        </div>
        {/* Same link as the pinned-bottom one further down, mounted in
            exactly ONE of the two places at a time (`isDesktop`), never
            both -- two `<a>` elements with the same accessible name would
            break `getByRole('link', { name: PUBLIC_COPY.whatsappButton })`
            in every existing WhatsApp test, none of which expect more than
            one match. */}
        {isDesktop && whatsapp !== null ? (
          <a
            href={`https://wa.me/${whatsapp}`}
            className="flex h-14 shrink-0 items-center justify-center rounded-btn bg-green px-7 text-lg font-extrabold text-white"
          >
            {PUBLIC_COPY.whatsappButton}
          </a>
        ) : null}
      </div>

      {isDesktop ? (
        // Pills (README: "segmented on phone, pills on desktop"). A
        // separate branch, not a CSS-only reflow of the segmented control
        // below, for the same reason as the WhatsApp link above: mounting
        // both at once would give every cabin button a duplicate accessible
        // name (`getByRole('button', { name: 'Casa Azul' })` expects one).
        <div role="group" aria-label={PUBLIC_COPY.filterLabel} className={pillRowClass}>
          {cabinOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={pillButtonClass(selectedCabin === option.key)}
              onClick={() => setSelectedCabin(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <div role="group" aria-label={PUBLIC_COPY.filterLabel} className={`${segmentedTrackClass} bg-track-2`}>
          {cabinOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={segmentedButtonClass(selectedCabin === option.key, 'h-[46px]')}
              onClick={() => setSelectedCabin(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={PUBLIC_COPY.previousMonth}
          className={`${navButtonClass} bg-surface-muted`}
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
        >
          {PUBLIC_COPY.previousMonthGlyph}
        </button>
        <span className="text-xl font-extrabold text-primary">{monthLabel}</span>
        <button
          type="button"
          aria-label={PUBLIC_COPY.nextMonth}
          className={`${navButtonClass} bg-surface-muted`}
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
        >
          {PUBLIC_COPY.nextMonthGlyph}
        </button>
      </div>

      {error !== null ? (
        <p className="text-base font-bold text-warm">{resolveErrorCopy(error)}</p>
      ) : (
        <div className="flex flex-col gap-[18px] lg:flex-row lg:gap-11">
          <div className="flex flex-1 flex-col gap-3.5">
            <span className="hidden text-xl font-extrabold text-primary lg:block">{monthLabel}</span>
            <PublicMonthCalendar month={month} occupiedRanges={displayedRanges} />
          </div>
          {isDesktop ? (
            <div className="flex flex-1 flex-col gap-3.5">
              <span className="text-xl font-extrabold text-primary">{secondMonthLabel}</span>
              <PublicMonthCalendar month={secondMonth} occupiedRanges={displayedRanges} />
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-5 text-base text-muted">
        <span className="flex items-center gap-2">
          <span className="h-[18px] w-[18px] rounded-md border border-input-border bg-surface" />
          {PUBLIC_COPY.legendFree}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[18px] w-[18px] rounded-md bg-occupied" />
          {PUBLIC_COPY.legendOccupied}
        </span>
      </div>

      {/* One tile per the tenant's own cabin (task: replace the handoff's
          hardcoded "Casa Azul"/"Dos Aguas" tiles, the same tenant-data-
          frozen-into-copy defect class as `HOME_COPY.greeting`). The grid's
          `lg:grid-cols-3` is a pure CSS column-count decision independent of
          how many tiles actually render -- a tenant with one or two cabins
          simply leaves the last column(s) of the row empty at `lg:`, and no
          cap is imposed on tenants with more. A tenant with zero cabins gets
          no heading and no empty grid: an honest empty state, not a broken-
          looking page. */}
      {availability.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <div className="text-lg font-extrabold text-primary">{PUBLIC_COPY.housesTitle}</div>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-4">
            {availability.map((cabin) => (
              <PhotoPlaceholder key={cabin.propertyId} label={cabinPhotoLabel(cabin.name)} />
            ))}
          </div>
        </div>
      ) : null}

      {/* The mobile counterpart of the top-right link above -- mounted only
          when `!isDesktop`, for the same duplicate-accessible-name reason. */}
      {!isDesktop && whatsapp !== null ? (
        <a
          href={`https://wa.me/${whatsapp}`}
          className="fixed inset-x-5 bottom-5 mx-auto flex h-16 max-w-[520px] items-center justify-center rounded-btn bg-green text-lg font-extrabold text-white"
        >
          {PUBLIC_COPY.whatsappButton}
        </a>
      ) : null}
    </div>
  )
}
