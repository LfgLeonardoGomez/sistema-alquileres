import { getMonthGrid, type YearMonth } from '../shared/calendar/monthGrid'
import { computeSegments, type DateRange } from '../shared/calendar/segments'
import { WEEKDAY_INITIALS } from '../shared/copy/public'

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

export function PublicMonthCalendar({ month, occupiedRanges }: Props) {
  const grid = getMonthGrid(month)
  const segments = computeSegments(occupiedRanges, month)

  const occupiedDates = new Set<string>()
  for (const segment of segments) {
    occupiedDates.add(segment.date)
  }

  return (
    <table>
      <thead>
        <tr>
          {WEEKDAY_INITIALS.map((initial, index) => (
            // A fixed, never-reordered 7-item header -- an index key is safe here.
            <th key={index}>{initial}</th>
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
              const occupied = occupiedDates.has(cell.date)
              // One flat class regardless of which range (or which merged
              // "Las dos" interval) the day belongs to -- `range.key` never
              // reaches this className, which is the structural half of
              // "no per-stay colour" (the other half is the missing
              // stay-identity prop on this component's own `Props`).
              const className = occupied ? 'public-calendar__day public-calendar__day--occupied' : 'public-calendar__day'
              return (
                <td
                  key={cell.date}
                  data-testid={`day-${cell.date}`}
                  data-occupied={occupied ? 'true' : undefined}
                  className={className}
                >
                  {dayOfMonth(cell.date)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
