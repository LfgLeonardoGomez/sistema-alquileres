import { describe, expect, it } from 'vitest'
import { parsePlainDate } from '../../shared/date/parsePlainDate'
import { isRangeLegal } from './wizard/RangePickerCalendar'
import { occupiedNightsFor, type OccupancyStay } from './occupancy'

// tasks 6.18-6.21, `reservation-ledger` spec's "The Edit Calendar Excludes
// The Reservation Being Edited From Its Own Occupied Display" -- design D34.
//
// 5.6/5.7 built `occupiedNightsFor` and pinned its SHAPE at the type level
// (`occupancy.test-d.ts`: an omitted `excludeReservationId` is a compile
// error, never a silent runtime gap). This file is the first to exercise
// what the parameter actually DOES at runtime, which is the half a type
// cannot check.
//
// The trap D34 names: "The server cannot help here. `EXCLUDE USING gist`
// compares distinct rows, so a reservation never conflicts with itself; a
// picker that shows the stay being edited as occupied is correct-looking
// and completely broken, and it fails only when someone tries to shift a
// date by one day."

const R = 'd1111111-1111-1111-1111-111111111111'
const S = 'd2222222-2222-2222-2222-222222222222'

function stay(id: string, checkIn: string, checkOut: string): OccupancyStay {
  return { id, checkIn: parsePlainDate(checkIn), checkOut: parsePlainDate(checkOut) }
}

// R holds 2026-09-03 -> 2026-09-07 (four nights) on Casa Azul. S holds
// 2026-09-10 -> 2026-09-12 (two nights) on the SAME cabin, so the two
// halves of the requirement can be told apart: R's nights must disappear,
// S's must not.
const CABIN_STAYS: readonly OccupancyStay[] = [
  stay(R, '2026-09-03', '2026-09-07'),
  stay(S, '2026-09-10', '2026-09-12'),
]

describe('occupiedNightsFor', () => {
  // 6.18 [TRAP]. Asserted against BOTH exclusions on purpose: without the
  // `null` half, a set that simply never contained R's nights would satisfy
  // the excluded half just as well, and the parameter would be proving
  // nothing.
  it("excludes the edited reservation's own nights while another stay's nights on the same cabin stay occupied", () => {
    const whileEditingR = occupiedNightsFor(CABIN_STAYS, { excludeReservationId: R })

    // R's own four nights are gone -- the whole point of the exclusion.
    expect(whileEditingR.has('2026-09-03')).toBe(false)
    expect(whileEditingR.has('2026-09-04')).toBe(false)
    expect(whileEditingR.has('2026-09-05')).toBe(false)
    expect(whileEditingR.has('2026-09-06')).toBe(false)

    // S's nights are untouched: this is an exclusion of ONE reservation,
    // not a general unlock of the cabin.
    expect(whileEditingR.has('2026-09-10')).toBe(true)
    expect(whileEditingR.has('2026-09-11')).toBe(true)
    // Half-open, exactly as `segments.ts` and `useReservationsForCabin`
    // treat every range in this app: the check-out day is not a night.
    expect(whileEditingR.has('2026-09-12')).toBe(false)

    // And the same input with the create-wizard's own `null` DOES report
    // R's nights -- so the four `false`s above are the parameter working,
    // not the fixture being empty.
    const whileCreating = occupiedNightsFor(CABIN_STAYS, { excludeReservationId: null })
    expect(whileCreating.has('2026-09-03')).toBe(true)
    expect(whileCreating.has('2026-09-06')).toBe(true)
    expect(whileCreating.has('2026-09-07')).toBe(false)
  })

  // 6.20 [TRIANGULATE], the spec's "Moving a stay by one night succeeds
  // without a false block". The shift D34 names as the failure mode that
  // "fails only when someone tries to shift a date by one day": R moves
  // from 09-03->09-07 to 09-04->09-08, which OVERLAPS its own former
  // nights and must therefore be legal only because they are excluded.
  //
  // Checked through 5.11's own `isRangeLegal`, the function the picker
  // actually gates the second tap with -- asserting on the raw set alone
  // would prove the set is right without proving the picker consults it.
  it('a one-night shift over the stay\'s own former nights is a legal selection', () => {
    const whileEditingR = occupiedNightsFor(CABIN_STAYS, { excludeReservationId: R })

    expect(isRangeLegal(parsePlainDate('2026-09-04'), parsePlainDate('2026-09-08'), whileEditingR)).toBe(true)

    // The same shift while CREATING a new stay is correctly refused -- R's
    // nights are genuinely taken for anyone who is not R.
    const whileCreating = occupiedNightsFor(CABIN_STAYS, { excludeReservationId: null })
    expect(isRangeLegal(parsePlainDate('2026-09-04'), parsePlainDate('2026-09-08'), whileCreating)).toBe(false)

    // And S still blocks R: an edit that reaches into S's nights is refused
    // even with R excluded, which is what makes 6.28's conflict copy a real
    // path rather than a hypothetical one.
    expect(isRangeLegal(parsePlainDate('2026-09-09'), parsePlainDate('2026-09-12'), whileEditingR)).toBe(false)
  })
})
