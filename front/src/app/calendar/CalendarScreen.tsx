import { useEffect } from 'react'
import type { DateRange } from '../../shared/calendar/segments'
import { computeSegments } from '../../shared/calendar/segments'
import { CALENDAR_COPY } from '../../shared/copy/calendar'
import { useCabins } from '../reservations/useCabins'
import { useClients } from '../reservations/useClients'
import { useReservationsForCabin } from '../reservations/useReservationsForCabin'
import { TabBar } from '../shell/TabBar'
import { PrivateMonthCalendar } from './PrivateMonthCalendar'
import { assignPastelSlots } from './pastels'
import { useCabinParam } from './useCabinParam'
import { useMonthParam } from './useMonthParam'
import { WhoStays } from './WhoStays'

// Screen 03, `reservation-calendar` spec: the segmented control (one cabin
// shown at a time, D31's URL-state rule), the read-only month grid (D28's
// headless core + `pastels.ts`'s colouring, tasks 4.13-4.16), and "Quién se
// queda" below it (tasks 4.19-4.28). Deliberately out of THIS run's scope,
// flagged rather than silently added: month navigation buttons (the
// handoff draws `‹ Septiembre 2026 ›`) -- no task in 4.13-4.28 tests
// navigating between months on this screen, and `useMonthParam`'s own
// setter is already proven correct in isolation (4.11/4.12); inventing an
// untested interactive affordance here would be scope creep past the
// assigned tasks. The month header renders as plain, non-interactive text.

export function CalendarScreen() {
  const [month] = useMonthParam()
  const [cabinIdParam, setCabinId] = useCabinParam()
  const cabins = useCabins()
  const clients = useClients()

  const selectedCabinId = cabinIdParam ?? cabins.data?.[0]?.id ?? null

  // useCabinParam.ts's own documented contract: "the caller ... is
  // responsible for defaulting to a real cabin once useCabins()'s list is
  // in hand." Writing the default back into the URL (rather than merely
  // rendering it) keeps D31's own rule -- "the selected cabin ... lives in
  // the URL" -- true even for a first visit that arrives with no `?cabana=`
  // at all, e.g. a bookmark of bare `/calendario`.
  useEffect(() => {
    if (cabinIdParam !== null) return
    const firstCabin = cabins.data?.[0]
    if (firstCabin === undefined) return
    setCabinId(firstCabin.id)
  }, [cabinIdParam, cabins.data, setCabinId])

  const reservations = useReservationsForCabin(selectedCabinId)

  // D30's "cancelled stays filtered out of every occupancy computation and
  // every list" -- applied here once, upstream of BOTH the grid's own
  // segmentation and the pastel assignment, so a cancelled stay's freed
  // nights never render as occupied and never consume a colour slot.
  const activeStays = (reservations.data ?? []).filter((reservation) => reservation.status !== 'cancelled')
  const stayRanges: readonly DateRange[] = activeStays.map((reservation) => ({
    key: reservation.id,
    start: reservation.checkIn,
    end: reservation.checkOut,
  }))
  // D28's tripwire: the COMPLETE per-cabin stay list, never the visible
  // month's subset -- `stayRanges` above is already month-independent
  // (`useReservationsForCabin` fetches with no date window at all), and
  // `assignPastelSlots` itself has no month parameter to accidentally
  // narrow it with.
  const slotByKey = assignPastelSlots(stayRanges)
  const segments = computeSegments(stayRanges, month)

  const guestsById = new Map((clients.data ?? []).map((client) => [client.id, { full_name: client.full_name }]))

  return (
    <div>
      <div role="group" aria-label={CALENDAR_COPY.cabinFilterLabel}>
        {(cabins.data ?? []).map((cabin) => (
          <button key={cabin.id} type="button" aria-pressed={cabin.id === selectedCabinId} onClick={() => setCabinId(cabin.id)}>
            {cabin.name}
          </button>
        ))}
      </div>
      <PrivateMonthCalendar month={month} segments={segments} slotByKey={slotByKey} />
      <WhoStays reservations={reservations.data ?? []} guestsById={guestsById} month={month} slotByKey={slotByKey} />
      <TabBar />
    </div>
  )
}
