import { Temporal } from 'temporal-polyfill'
import { parsePlainDate, type PlainDate } from '../date/parsePlainDate'
import type { DateRange } from './segments'

// design D28's `Las dos` filter: with two cabins selected on the public
// page, two stays *can* legitimately cover the same night (one per
// cabin), and the naive implementation unions them -- wrong, and wrong in
// the expensive direction, since it shows a night as taken when one cabin
// is still free. A night is occupied only when EVERY group in
// `rangesPerGroup` covers it: this is an intersection, never a union.
// These output ranges are not stays -- adjacency has no meaning over them
// (there is no `key` on the output), which matches the public page having
// no adjacency semantics and one flat colour.

export type OccupiedRange = { readonly start: PlainDate; readonly end: PlainDate }

type TemporalRange = { start: Temporal.PlainDate; end: Temporal.PlainDate }

function toTemporalRanges(ranges: readonly DateRange[]): TemporalRange[] {
  return ranges.map((r) => ({ start: Temporal.PlainDate.from(r.start), end: Temporal.PlainDate.from(r.end) }))
}

/** Unions a single group's own ranges into non-overlapping, non-touching intervals. */
function mergeGroup(ranges: readonly DateRange[]): TemporalRange[] {
  const sorted = toTemporalRanges(ranges).sort((a, b) => Temporal.PlainDate.compare(a.start, b.start))

  const merged: TemporalRange[] = []
  for (const current of sorted) {
    const last = merged.at(-1)
    if (last !== undefined && Temporal.PlainDate.compare(current.start, last.end) <= 0) {
      if (Temporal.PlainDate.compare(current.end, last.end) > 0) {
        last.end = current.end
      }
    } else {
      merged.push({ start: current.start, end: current.end })
    }
  }
  return merged
}

/** Intersects two already-merged, sorted interval lists via a two-pointer sweep. */
function intersectPair(a: readonly TemporalRange[], b: readonly TemporalRange[]): TemporalRange[] {
  const result: TemporalRange[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    const left = a[i]
    const right = b[j]
    if (left === undefined || right === undefined) {
      break
    }

    const overlapStart = Temporal.PlainDate.compare(left.start, right.start) > 0 ? left.start : right.start
    const overlapEnd = Temporal.PlainDate.compare(left.end, right.end) < 0 ? left.end : right.end

    if (Temporal.PlainDate.compare(overlapStart, overlapEnd) < 0) {
      result.push({ start: overlapStart, end: overlapEnd })
    }

    if (Temporal.PlainDate.compare(left.end, right.end) < 0) {
      i++
    } else {
      j++
    }
  }

  return result
}

/**
 * A night is occupied only when every group in `rangesPerGroup` covers it
 * (design D28's `Las dos` intersection rule). An empty group (a cabin with
 * no occupied ranges at all, i.e. fully free) correctly yields no occupied
 * nights in the intersection.
 */
export function intersectOccupancy(rangesPerGroup: readonly (readonly DateRange[])[]): OccupiedRange[] {
  if (rangesPerGroup.length === 0) {
    return []
  }

  const [firstGroup, ...restGroups] = rangesPerGroup.map(mergeGroup)
  if (firstGroup === undefined) {
    return []
  }

  const intersected = restGroups.reduce<TemporalRange[]>(intersectPair, firstGroup)

  return intersected.map((r) => ({ start: parsePlainDate(r.start.toString()), end: parsePlainDate(r.end.toString()) }))
}
