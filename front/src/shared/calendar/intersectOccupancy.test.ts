import { describe, expect, it } from 'vitest'
import { intersectOccupancy } from './intersectOccupancy'
import { parsePlainDate } from '../date/parsePlainDate'
import type { DateRange } from './segments'

// design D28's `Las dos` trap: with two cabins selected on the public
// page, a night is occupied only when EVERY selected cabin is occupied --
// an intersection, never a union. Getting this backwards turns away a
// booking the owner could have taken.

function range(key: string, start: string, end: string): DateRange {
  return { key, start: parsePlainDate(start), end: parsePlainDate(end) }
}

function coversNight(ranges: readonly { start: string; end: string }[], night: string): boolean {
  return ranges.some((r) => r.start <= night && night < r.end)
}

describe('intersectOccupancy', () => {
  it('reports a night FREE when only one of two cabins is occupied -- intersection, not union', () => {
    // Cabin A occupied 2026-09-10..2026-09-15; cabin B free all along.
    const cabinA = [range('A-stay', '2026-09-10', '2026-09-15')]
    const cabinB: DateRange[] = []

    const occupied = intersectOccupancy([cabinA, cabinB])

    expect(coversNight(occupied, '2026-09-12')).toBe(false)
  })

  it('[TRIANGULATE] reports a night OCCUPIED when both cabins are occupied', () => {
    const cabinA = [range('A-stay', '2026-09-10', '2026-09-15')]
    const cabinB = [range('B-stay', '2026-09-11', '2026-09-13')]

    const occupied = intersectOccupancy([cabinA, cabinB])

    expect(coversNight(occupied, '2026-09-12')).toBe(true)
  })

  it('[TRIANGULATE] reports a night FREE when both cabins are free', () => {
    const cabinA: DateRange[] = []
    const cabinB: DateRange[] = []

    const occupied = intersectOccupancy([cabinA, cabinB])

    expect(coversNight(occupied, '2026-09-12')).toBe(false)
    expect(occupied).toEqual([])
  })
})
