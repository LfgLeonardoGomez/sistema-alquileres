import { getMonthGrid, type YearMonth } from '../shared/calendar/monthGrid'
import { computeSegments, type DateRange } from '../shared/calendar/segments'
import { WEEKDAY_INITIALS } from '../shared/copy/public'
import { dayBarClass, dayNumberClass, weekdayHeaderClass, type DayBarKind } from '../shared/ui'

// design D28: "the public surface is *not* a third colour scheme." This
// component receives ranges to segment (per-cabin ranges, or already
// `intersectOccupancy`d merged ranges for "Las dos") and renders every
// occupied night with ONE flat neutral class -- `range.key` is used only
// internally by `computeSegments` to decide rounding (start/middle/end),
// never surfaced as a colour or an identity prop. There is no stay-identity
// prop in this component's own `Props` type at all -- structurally, the
// same shape of guarantee as `public/api.ts`'s missing token parameter.

type Props = {
  readonly month: YearMonth
  readonly occupiedRanges: readonly DateRange[]
}

function dayOfMonth(date: string): number {
  // Reads the branded PlainDate string's own digits directly, the same
  // convention `shared/date/format.ts` uses -- never a `Date`.
  return Number(date.slice(8, 10))
}

// A day can carry two adjacency half-segments (an outgoing stay's checkout
// and an incoming stay's check-in landing on the same date) -- the public
// page renders ONE flat neutral colour regardless (D28: "not a third colour
// scheme"), so a day with any segment reads as fully occupied, never as two
// visually distinct halves the way the private calendar does.
function collapsedKind(daySegments: readonly { readonly kind: DayBarKind }[]): DayBarKind | null {
  if (daySegments.length === 0) return null
  if (daySegments.length > 1) return 'middle'
  return daySegments[0]!.kind
}

export function PublicMonthCalendar({ month, occupiedRanges }: Props) {
  const grid = getMonthGrid(month)
  const segments = computeSegments(occupiedRanges, month)

  const segmentsByDate = new Map<string, DayBarKind[]>()
  for (const segment of segments) {
    const existing = segmentsByDate.get(segment.date)
    if (existing === undefined) {
      segmentsByDate.set(segment.date, [segment.kind])
    } else {
      existing.push(segment.kind)
    }
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
              const kinds = segmentsByDate.get(cell.date) ?? []
              const kind = collapsedKind(kinds.map((k) => ({ kind: k })))
              const occupied = kind !== null
              return (
                <td
                  key={cell.date}
                  data-testid={`day-${cell.date}`}
                  data-occupied={occupied ? 'true' : undefined}
                  className="relative h-[50px] text-center"
                >
                  {kind !== null ? <div className={`${dayBarClass(kind)} bg-occupied`} /> : null}
                  <span className={dayNumberClass(occupied)}>{dayOfMonth(cell.date)}</span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
