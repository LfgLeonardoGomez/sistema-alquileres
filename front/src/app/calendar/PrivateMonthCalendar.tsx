import { getMonthGrid, type YearMonth } from '../../shared/calendar/monthGrid'
import type { DaySegment } from '../../shared/calendar/segments'
import type { PastelSlot } from './pastels'

// tasks 4.14-4.16: the private, per-cabin surface of design D28's headless
// core -- `PublicMonthCalendar.tsx`'s own authenticated-tree sibling, same
// geometry, different colour rules (one pastel per stay via `pastels.ts`,
// never the public page's single flat neutral bar).
//
// task 4.15/4.16's "no interaction" requirement is enforced STRUCTURALLY,
// the same subtraction pattern this codebase uses everywhere (`ApiError`
// lacking `detail`, `assignPastelSlots` lacking a `month` parameter): there
// is no `onClick`/`onTap` prop anywhere in this component's own `Props`
// type, and no handler is attached to any cell below. A day cannot start a
// selection because there is no code path that could -- not because a
// handler happens to be a no-op.

type Props = {
  readonly month: YearMonth
  readonly segments: readonly DaySegment[]
  readonly slotByKey: ReadonlyMap<string, PastelSlot>
}

const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

function dayOfMonth(date: string): number {
  // Reads the branded PlainDate string's own digits directly -- the same
  // convention `shared/date/format.ts` and `PublicMonthCalendar.tsx` use,
  // never a `Date`.
  return Number(date.slice(8, 10))
}

export function PrivateMonthCalendar({ month, segments, slotByKey }: Props) {
  const grid = getMonthGrid(month)

  const segmentsByDate = new Map<string, DaySegment[]>()
  for (const segment of segments) {
    const existing = segmentsByDate.get(segment.date)
    if (existing === undefined) {
      segmentsByDate.set(segment.date, [segment])
    } else {
      existing.push(segment)
    }
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
              const daySegments = segmentsByDate.get(cell.date) ?? []
              const occupied = daySegments.length > 0

              return (
                <td
                  key={cell.date}
                  data-testid={`day-${cell.date}`}
                  data-occupied={occupied ? 'true' : undefined}
                  data-pastel-slots={occupied ? daySegments.map((segment) => slotByKey.get(segment.key)).join(',') : undefined}
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
