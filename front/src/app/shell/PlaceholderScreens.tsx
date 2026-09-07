import { SHELL_COPY } from '../../shared/copy/shell'
import { TabBar } from './TabBar'

// Task 3.23: instructive stand-in screens for the three tabs not built
// until Phases 4/7/8 (`reservation-calendar`, `guest-directory`, and the
// cabins screen respectively) -- each renders the handoff's own "nothing
// recorded yet" copy (or, for Cabañas, a same-register equivalent; see
// `shared/copy/shell.ts`'s own note) plus the real, working `TabBar`, so
// tapping any tab always lands on rendered, navigable content and never a
// blank screen or a dead link.

export function CalendarPlaceholder() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <p className="flex-1 px-5 pt-16 text-lg text-muted">{SHELL_COPY.calendarEmpty}</p>
      <TabBar />
    </div>
  )
}

export function GuestsPlaceholder() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <p className="flex-1 px-5 pt-16 text-lg text-muted">{SHELL_COPY.guestsEmpty}</p>
      <TabBar />
    </div>
  )
}

export function CabinsPlaceholder() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <p className="flex-1 px-5 pt-16 text-lg text-muted">{SHELL_COPY.cabinsEmpty}</p>
      <TabBar />
    </div>
  )
}
