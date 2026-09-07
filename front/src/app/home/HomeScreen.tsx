import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import { apiRequest } from '../api/client'
import { monthWindow, type YearMonth } from '../../shared/calendar/monthGrid'
import { HOME_COPY, MONTH_LABELS } from '../../shared/copy/home'
import { todayAR } from '../../shared/date/todayAR'
import { TabBar } from '../shell/TabBar'
import { SignOutButton } from '../session/SignOutButton'

// home-summary spec: screen 02, "deliberately empty" -- one occupancy card,
// one always-reachable action, nothing else (tasks 3.17-3.22).
//
// `GET /dashboard/summary` (back/app/schemas/dashboard.py) returns
// `collected` in the SAME response used for occupancy. This screen must
// not render it (home-summary spec "No Revenue Figure Is Ever Rendered")
// -- enforced the same way D32 keeps `detail` off `ApiError`: the type
// below has no `collected` field, so there is no code path that could read
// it, structurally, not by discipline.
type DashboardOccupancy = {
  readonly occupied_nights: number
  readonly available_nights: number
}

// The AR-time month, never the browser's local/UTC one (design D26,
// tasks 3.19/3.20). `todayAR()` is the app's single source of "today";
// `monthWindow` (already built for the public calendar, `shared/calendar/`)
// derives the same `[first_of_month, first_of_next_month)` half-open window
// the backend's own `month_window()` computes.
function currentYearMonth(): YearMonth {
  const today = Temporal.PlainDate.from(todayAR())
  return { year: today.year, month: today.month }
}

function monthLabelFor(month: number): string {
  const label = MONTH_LABELS[month - 1]
  if (label === undefined) {
    throw new Error(`Invalid month index: ${month}`)
  }
  return label
}

export function HomeScreen() {
  const [occupancy, setOccupancy] = useState<DashboardOccupancy | null>(null)

  // Derived at render, not stored in state -- `todayAR()` is cheap and pure,
  // and re-deriving it avoids a second, possibly-stale source of "which
  // month is this" (the same reasoning D30 gives against mirroring anything
  // derivable).
  const yearMonth = currentYearMonth()
  const { start, end } = monthWindow(yearMonth)
  const monthLabel = monthLabelFor(yearMonth.month)

  useEffect(() => {
    let cancelled = false
    apiRequest<DashboardOccupancy>(`/dashboard/summary?from=${start}&to=${end}`)
      .then((response) => {
        if (!cancelled) setOccupancy(response)
      })
      .catch(() => {
        // No error copy is spec'd for this screen -- the card simply stays
        // at its zero state, and the one action ("Anotar una reserva")
        // remains reachable regardless (3.21/3.22's own unconditional
        // requirement covers this case too).
        if (!cancelled) setOccupancy(null)
      })
    return () => {
      cancelled = true
    }
  }, [start, end])

  const occupiedNights = occupancy?.occupied_nights ?? 0
  const totalNights = occupancy !== null ? occupancy.occupied_nights + occupancy.available_nights : 0

  return (
    <div>
      <p>{monthLabel}</p>
      <h1>{HOME_COPY.greeting}</h1>
      <section aria-label={HOME_COPY.occupiedNightsTitle}>
        <h2>{HOME_COPY.occupiedNightsTitle}</h2>
        <p>
          {occupiedNights} {HOME_COPY.of} {totalNights}
        </p>
      </section>
      {/* home-summary spec "'Anotar Una Reserva' Is Always Reachable In One
          Tap" -- unconditional, never behind an empty-state branch. The
          wizard itself (Phase 5) does not exist yet; this is the same kind
          of forward reference `routes.tsx` already carries for other
          not-yet-built screens (D31's routing table). */}
      <Link to="/reserva/nueva/1">{HOME_COPY.addReservation}</Link>
      {/* owner-session spec's "The Owner Can Sign Out From Inside The App",
          Note C(i) (approved 10.1(f)): a low-emphasis affordance owned by
          `app/session/`, composed here -- after "Anotar una reserva",
          above the tab bar -- rather than as a fifth tab. `TabBar.tsx`
          itself is untouched by this or any task in this phase. */}
      <SignOutButton />
      {/* Handoff screen 02: "Sticky bottom tab bar (4 items: Inicio ·
          Calendario · Huéspedes · Cabañas)" -- every authenticated screen
          composes the same shared `TabBar` (task 3.23). */}
      <TabBar />
    </div>
  )
}
