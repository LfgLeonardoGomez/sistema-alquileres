import { useEffect } from 'react'
import { Temporal } from 'temporal-polyfill'
import type { YearMonth } from '../../shared/calendar/monthGrid'
import type { DateRange } from '../../shared/calendar/segments'
import { computeSegments } from '../../shared/calendar/segments'
import { CALENDAR_COPY } from '../../shared/copy/calendar'
import { RESERVATION_WIZARD_COPY } from '../../shared/copy/reservations'
import { formatMonthYear } from '../../shared/date/format'
import { navButtonClass, segmentedButtonClass, segmentedTrackClass } from '../../shared/ui'
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
// queda" below it (tasks 4.19-4.28). The month header (`‹ Septiembre 2026
// ›`) shares `formatMonthYear()` with the wizard's date step -- added per
// the owner's live-review correction #4 (2026-09-07): "el calendario no
// tiene el nombre del mes que estamos viendo" -- never a second
// date-formatting path.
//
// Owner's live-review correction #2 (2026-09-07): "cuando voy a la
// pestaña calendario solo me muestra el mes actual, no puedo navegar para
// ver otros meses" -- the header above was plain, non-interactive text
// with no way to change `?mes=`. Fixed by wiring the SAME prev/next
// chevron pair `DateStep.tsx`/`EditReservation.tsx` already use around
// their own month heading (`navButtonClass`, `RESERVATION_WIZARD_COPY`'s
// glyphs/labels, and each file's own small private `shiftMonth` -- this
// codebase's established, twice-repeated convention for that one pure
// function rather than a third shared module) -- not a new control.
//
// Deliberately UNCHANGED: `useReservationsForCabin`'s fetch. It already
// returns the cabin's COMPLETE stay list, never date-windowed (D28's own
// tripwire, this hook's own header comment) -- `assignPastelSlots` needs
// every stay to keep colours consistent and collision-free across a month
// boundary, and `computeSegments`/`WhoStays` already both take `month` and
// derive their own visible slice from that complete list (`overlapsMonth`
// below). Paging months here changes what `month` value flows into those
// two already-`month`-aware consumers -- there is no second, narrower
// fetch to add without breaking D28's own reason for fetching the whole
// list in the first place.

function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const shifted = Temporal.PlainDate.from({ year: month.year, month: month.month, day: 1 }).add({ months: delta })
  return { year: shifted.year, month: shifted.month }
}

export function CalendarScreen() {
  const [month, setMonth] = useMonthParam()
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
    <div className="flex min-h-screen flex-col bg-page">
      <div className="flex flex-1 flex-col gap-[18px] px-[18px] pt-16 pb-5">
        <div role="group" aria-label={CALENDAR_COPY.cabinFilterLabel} className={segmentedTrackClass}>
          {(cabins.data ?? []).map((cabin) => (
            <button
              key={cabin.id}
              type="button"
              aria-pressed={cabin.id === selectedCabinId}
              className={segmentedButtonClass(cabin.id === selectedCabinId)}
              onClick={() => setCabinId(cabin.id)}
            >
              {cabin.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            aria-label={RESERVATION_WIZARD_COPY.previousMonth}
            className={navButtonClass}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            {RESERVATION_WIZARD_COPY.previousMonthGlyph}
          </button>
          <h2 className="text-xl font-extrabold text-primary">{formatMonthYear(month)}</h2>
          <button
            type="button"
            aria-label={RESERVATION_WIZARD_COPY.nextMonth}
            className={navButtonClass}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            {RESERVATION_WIZARD_COPY.nextMonthGlyph}
          </button>
        </div>
        <PrivateMonthCalendar month={month} segments={segments} slotByKey={slotByKey} />
        <WhoStays reservations={reservations.data ?? []} guestsById={guestsById} month={month} slotByKey={slotByKey} />
      </div>
      <TabBar />
    </div>
  )
}
