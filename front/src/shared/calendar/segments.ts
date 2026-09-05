import { Temporal } from 'temporal-polyfill'
import { parsePlainDate, type PlainDate } from '../date/parsePlainDate'
import { monthWindow, type YearMonth } from './monthGrid'

// design D28: turns half-open `[start, end)` ranges into per-day segments.
// `key` is an opaque identifier -- this module has no notion of what it
// names (task 2.17's domain-import scan). `start`/`end` are read as
// `check_in`/`check_out` would be, but this module never uses those words:
// they are domain vocabulary, and this module is legal in both route trees
// precisely because it carries none.

export type DateRange = { readonly key: string; readonly start: PlainDate; readonly end: PlainDate }

export type SegmentKind = 'start' | 'middle' | 'end' | 'single' | 'closingHalf' | 'openingHalf'

export type DaySegment = { readonly date: PlainDate; readonly key: string; readonly kind: SegmentKind }

/**
 * Segments each range's occupied nights (`[start, end)`) for a target
 * month. `end` itself never carries a segment -- the range is half-open,
 * and rendering the checkout day as occupied is the off-by-one this design
 * exists to prevent.
 */
export function computeSegments(ranges: readonly DateRange[], month: YearMonth): DaySegment[] {
  const window = monthWindow(month)
  const monthStart = Temporal.PlainDate.from(window.start)
  const monthEnd = Temporal.PlainDate.from(window.end)

  const segments: DaySegment[] = []

  for (const range of ranges) {
    const start = Temporal.PlainDate.from(range.start)
    const end = Temporal.PlainDate.from(range.end)
    const lastOccupiedNight = end.subtract({ days: 1 })

    // Each range is segmented over its own absolute `[start, end)` -- kind
    // is decided by the range's true edges, never by the target month's
    // edges, so a night that merely happens to fall on the last visible
    // day of a partial month is correctly `middle`, not falsely rounded.
    // The month only decides which of those days this call returns
    // (design D28: "computed independently per displayed month").
    let cursor = start
    while (Temporal.PlainDate.compare(cursor, end) < 0) {
      if (Temporal.PlainDate.compare(cursor, monthStart) >= 0 && Temporal.PlainDate.compare(cursor, monthEnd) < 0) {
        const isFirstNight = cursor.equals(start)
        const isLastNight = cursor.equals(lastOccupiedNight)
        const kind: SegmentKind =
          isFirstNight && isLastNight ? 'single' : isFirstNight ? 'start' : isLastNight ? 'end' : 'middle'

        segments.push({ date: parsePlainDate(cursor.toString()), key: range.key, kind })
      }
      cursor = cursor.add({ days: 1 })
    }
  }

  applyAdjacencySplits(segments, ranges, monthStart, monthEnd)

  return segments
}

/**
 * Design D28's central subtlety, applied as a post-pass over the base
 * per-stay segmentation: when one range's `end` (checkout, excluded from
 * its own occupied nights above) lands on the same day as another range's
 * `start` (check_in), that day is never a merge and never a conflict --
 * it is two independent half segments, one closing, one opening. Mutates
 * `segments` in place; still a pure function of its inputs.
 */
function applyAdjacencySplits(
  segments: DaySegment[],
  ranges: readonly DateRange[],
  monthStart: Temporal.PlainDate,
  monthEnd: Temporal.PlainDate,
): void {
  for (const outgoing of ranges) {
    const checkout = outgoing.end
    const checkoutDate = Temporal.PlainDate.from(checkout)
    if (Temporal.PlainDate.compare(checkoutDate, monthStart) < 0 || Temporal.PlainDate.compare(checkoutDate, monthEnd) >= 0) {
      continue
    }

    const incomingStays = ranges.filter((incoming) => incoming.key !== outgoing.key && incoming.start === checkout)
    if (incomingStays.length === 0) {
      continue
    }

    segments.push({ date: checkout, key: outgoing.key, kind: 'closingHalf' })

    for (const incoming of incomingStays) {
      const openingIndex = segments.findIndex(
        (segment) =>
          segment.date === checkout && segment.key === incoming.key && (segment.kind === 'start' || segment.kind === 'single'),
      )
      const opening = segments[openingIndex]
      if (openingIndex !== -1 && opening !== undefined) {
        segments[openingIndex] = { ...opening, kind: 'openingHalf' }
      }
    }
  }
}
