import { Link } from 'react-router'
import { Temporal } from 'temporal-polyfill'
import type { YearMonth } from '../../shared/calendar/monthGrid'
import { HOME_COPY, MONTH_LABELS } from '../../shared/copy/home'
import { todayAR } from '../../shared/date/todayAR'
import { TabBar } from '../shell/TabBar'
import { SignOutButton } from '../session/SignOutButton'
import { AvailabilitySearch } from './AvailabilitySearch'
import { UpcomingArrivals } from './UpcomingArrivals'

// home-summary spec: screen 02. The original "deliberately empty" occupancy
// card was replaced by the owner's own live-review decision (2026-09-07)
// with a "Próximas llegadas" card, one row per cabin -- see
// `UpcomingArrivals.tsx`'s own header for the full replacement rule. This
// screen still renders no revenue figure (home-summary spec "No Revenue
// Figure Is Ever Rendered") -- not merely by discipline: neither
// `UpcomingArrivals` nor `useUpcomingArrivals` carries a money field
// anywhere in their own types, the same structural-absence shape this
// screen's old `DashboardOccupancy` type used to enforce.
//
// The AR-time month label above the greeting is unaffected by that
// replacement and still stands (home-summary spec "The Displayed Month
// Label Reflects The Argentina-Time Month", design D26): `todayAR()` is the
// app's single source of "today", read fresh at render rather than stored
// in state (D30's own reasoning against mirroring anything derivable).
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
  const monthLabel = monthLabelFor(currentYearMonth().month)

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* `gap-4` (not this screen's own former `gap-[22px]`) -- matches
          `GuestDirectory.tsx`'s own established outer-gap convention rather
          than inventing a new spacing value, and keeps two stacked cards'
          worth of content plus "Anotar una reserva" above `TabBar.tsx`'s
          own sticky footer on a 402x874 canvas (measured empirically:
          without this, the button's bottom edge sits under the tab bar). */}
      <div className="flex flex-1 flex-col gap-4 px-[22px] pt-16 pb-6">
        <div className="flex flex-col gap-0.5">
          <p className="text-[17px] font-bold text-faint">{monthLabel}</p>
          <h1 className="text-[30px] font-extrabold tracking-tight text-primary">{HOME_COPY.greeting}</h1>
        </div>
        {/* Owner's own framing (2026-09-07): "es lo que más me preguntan"
            -- her most frequent action, placed above "Próximas llegadas"
            (the less frequent one) per the task brief's own ordering. */}
        <AvailabilitySearch />
        <UpcomingArrivals />
        <div className="flex-1" />
        {/* home-summary spec "'Anotar Una Reserva' Is Always Reachable In One
            Tap" -- unconditional, never behind an empty-state branch. The
            wizard itself (Phase 5) does not exist yet; this is the same kind
            of forward reference `routes.tsx` already carries for other
            not-yet-built screens (D31's routing table). */}
        <Link
          to="/reserva/nueva/1"
          className="flex h-[68px] items-center justify-center rounded-btn bg-accent text-[21px] font-extrabold text-white"
        >
          {HOME_COPY.addReservation}
        </Link>
        {/* owner-session spec's "The Owner Can Sign Out From Inside The App",
            Note C(i) (approved 10.1(f)): a low-emphasis affordance owned by
            `app/session/`, composed here -- after "Anotar una reserva",
            above the tab bar -- rather than as a fifth tab. `TabBar.tsx`
            itself is untouched by this or any task in this phase. */}
        <SignOutButton />
      </div>
      {/* Handoff screen 02: "Sticky bottom tab bar (4 items: Inicio ·
          Calendario · Huéspedes · Cabañas)" -- every authenticated screen
          composes the same shared `TabBar` (task 3.23). */}
      <TabBar />
    </div>
  )
}
