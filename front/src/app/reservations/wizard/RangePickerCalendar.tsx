import { Temporal } from 'temporal-polyfill'
import { getMonthGrid, type YearMonth } from '../../../shared/calendar/monthGrid'
import type { PlainDate } from '../../../shared/date/parsePlainDate'
import { dayBarClass, dayNumberClass, weekdayHeaderClass, type DayBarKind } from '../../../shared/ui'

// design D28, tasks 5.8-5.11: "The picker's interaction rule, which the
// handoff states twice and appears to contradict itself." Both are true
// because the two taps target different things:
//
//   - FIRST tap (entrada) selects a NIGHT. Legal only if that night is free.
//   - SECOND tap (salida) selects a BOUNDARY. Legal iff every night in
//     `[entrada, salida)` is free -- regardless of whether the night
//     BEGINNING on the salida day itself is taken.
//
// `pendingEntrada` is a CONTROLLED prop, not local state, deliberately:
// task 5.14's over-60-night guard requires picking a salida several months
// after entrada, which means this component must be able to remount with a
// different `month` prop while the in-progress selection survives --
// exactly the kind of state D30 would call out if it lived here instead of
// in `DateStep.tsx`, which owns it.

/**
 * D28's exact rule, isolated as its own pure function so 5.11's own
 * requirement ("confirm the naive 'grey cells are inert' implementation
 * fails this exact test before generalizing") is checkable in isolation.
 * Checks only the nights STRICTLY INSIDE `[entrada, salida)` -- the salida
 * day itself is never consulted, which is exactly what makes the handoff's
 * own `8/9`-to-`12/9` sample selection (ending on another stay's check-in)
 * legal.
 */
export function isRangeLegal(entrada: PlainDate, salida: PlainDate, occupiedNights: ReadonlySet<string>): boolean {
  const entradaDate = Temporal.PlainDate.from(entrada)
  const salidaDate = Temporal.PlainDate.from(salida)
  if (Temporal.PlainDate.compare(salidaDate, entradaDate) <= 0) return false

  let cursor = entradaDate
  while (Temporal.PlainDate.compare(cursor, salidaDate) < 0) {
    if (occupiedNights.has(cursor.toString())) return false
    cursor = cursor.add({ days: 1 })
  }
  return true
}

type SelectedRange = { readonly checkIn: PlainDate; readonly checkOut: PlainDate }

type Props = {
  readonly month: YearMonth
  readonly occupiedNights: ReadonlySet<string>
  readonly pendingEntrada: PlainDate | null
  readonly selectedRange: SelectedRange | null
  readonly onEntradaSelected: (date: PlainDate) => void
  /**
   * Reports EVERY completed second tap, including an illegal zero-night
   * attempt (`salida === entrada`) -- this component gates only on
   * OCCUPANCY (D28), never on night count. `DateStep.tsx` is the one place
   * that decides zero/60+ nights are refused (5.14/5.15's own, separate
   * client-side guard, stated in the design as "Also client-side" -- a
   * distinct sentence from the adjacency rule, not the same mechanism).
   */
  readonly onRangeAttempt: (entrada: PlainDate, salida: PlainDate) => void
}

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10))
}

function isWithinSelectedRange(date: PlainDate, range: SelectedRange | null): boolean {
  if (range === null) return false
  return date >= range.checkIn && date < range.checkOut
}

// Geometry only (D28): given a boolean membership test, decides whether
// `date` is the start/end/middle/only night of its own contiguous run --
// the same rounding rule `PrivateMonthCalendar.tsx` gets for free from
// `computeSegments`'s `SegmentKind`, recomputed here because this picker's
// "occupied" and "selected" sets are plain `Set<string>`/range booleans,
// not pre-segmented ranges.
function runKind(date: PlainDate, isMember: (candidate: PlainDate) => boolean): DayBarKind {
  const parsed = Temporal.PlainDate.from(date)
  const before = isMember(parsed.subtract({ days: 1 }).toString() as PlainDate)
  const after = isMember(parsed.add({ days: 1 }).toString() as PlainDate)
  if (!before && !after) return 'single'
  if (!before) return 'start'
  if (!after) return 'end'
  return 'middle'
}

export function RangePickerCalendar({ month, occupiedNights, pendingEntrada, selectedRange, onEntradaSelected, onRangeAttempt }: Props) {
  const grid = getMonthGrid(month)

  function handleTap(date: PlainDate) {
    if (pendingEntrada === null) {
      // FIRST tap (task 5.8/5.9): gated by the occupied set alone.
      if (occupiedNights.has(date)) return
      onEntradaSelected(date)
      return
    }

    if (date < pendingEntrada) {
      // Picking an earlier day restarts the selection with a new entrada --
      // still gated the same way the first tap is.
      if (occupiedNights.has(date)) return
      onEntradaSelected(date)
      return
    }

    // SECOND tap (task 5.10/5.11): every completed attempt is reported
    // upward, including `date === pendingEntrada` (zero nights) -- the
    // count guard is DateStep's job, not this gate's.
    if (date === pendingEntrada || isRangeLegal(pendingEntrada, date, occupiedNights)) {
      onRangeAttempt(pendingEntrada, date)
    }
    // An illegal salida (spans an occupied interior night) is silently
    // ignored -- the pending entrada stays exactly as it was, so she can
    // simply tap a different, legal salida next.
  }

  return (
    <table className="w-full border-separate border-spacing-0 rounded-card border border-card-border bg-surface px-2.5 pt-3.5 pb-[18px]">
      <thead>
        <tr>
          {WEEKDAY_INITIALS.map((initial, index) => (
            // A fixed, never-reordered 7-item header -- an index key is safe here.
            <th key={index} className={`${weekdayHeaderClass} pb-1.5 font-extrabold`}>
              {initial}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((week, weekIndex) => (
          // Rows never reorder within one render -- an index key is safe here.
          <tr key={weekIndex}>
            {week.map((cell, dayIndex) => {
              if (cell === null) {
                // Blank cells carry no identity -- an index key is safe here.
                return <td key={dayIndex} />
              }
              const occupied = occupiedNights.has(cell.date)
              const isPendingEntrada = cell.date === pendingEntrada
              const isSelected = isWithinSelectedRange(cell.date, selectedRange)
              const highlighted = occupied || isSelected || isPendingEntrada

              let barClass: string | null = null
              if (isSelected) {
                barClass = `${dayBarClass(runKind(cell.date, (candidate) => isWithinSelectedRange(candidate, selectedRange)))} bg-accent`
              } else if (isPendingEntrada) {
                barClass = `${dayBarClass('single')} bg-accent`
              } else if (occupied) {
                barClass = `${dayBarClass(runKind(cell.date, (candidate) => occupiedNights.has(candidate)))} bg-disabled`
              }

              return (
                <td key={cell.date} className="relative h-[50px] p-0 text-center">
                  <button
                    type="button"
                    data-testid={`day-${cell.date}`}
                    data-occupied={occupied ? 'true' : undefined}
                    data-pending-entrada={isPendingEntrada ? 'true' : undefined}
                    data-selected={isSelected ? 'true' : undefined}
                    aria-pressed={isPendingEntrada || isSelected}
                    className="relative flex h-full w-full items-center justify-center"
                    onClick={() => handleTap(cell.date)}
                  >
                    {barClass !== null ? <div className={barClass} /> : null}
                    <span className={dayNumberClass(highlighted, isSelected || isPendingEntrada)}>{dayOfMonth(cell.date)}</span>
                  </button>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
