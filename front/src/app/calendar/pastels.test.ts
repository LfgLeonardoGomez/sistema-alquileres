import { describe, expect, it } from 'vitest'
import { parsePlainDate } from '../../shared/date/parsePlainDate'
import type { DateRange } from '../../shared/calendar/segments'
import { assignPastelSlots } from './pastels'

// design D28 + month-calendar-rendering spec's "Color-Slot Assignment Keeps
// Adjacent Stays Distinguishable": three pastels cycled by `check_in` order,
// computed over the property's COMPLETE stay list -- this module has no
// `month` parameter at all (deliberately -- see `pastels.ts`'s own module
// doc), so a caller cannot accidentally pass a visible-month-filtered slice
// through a signature that would invite it.

function stay(key: string, start: string, end: string): DateRange {
  return { key, start: parsePlainDate(start), end: parsePlainDate(end) }
}

describe('assignPastelSlots', () => {
  it('assigns two stays sharing an adjacency day different color slots', () => {
    // Design D28's own example: Stay A check_in 09-08, Stay B check_in
    // 09-12 -- adjacent to Stay A's check_out 09-12.
    const stayA = stay('stay-a', '2026-09-08', '2026-09-12')
    const stayB = stay('stay-b', '2026-09-12', '2026-09-15')

    const slots = assignPastelSlots([stayA, stayB])

    expect(slots.get('stay-a')).not.toBe(slots.get('stay-b'))
  })

  // [TRIANGULATE] month-calendar-rendering spec's second color scenario: a
  // fourth stay (by check_in order) adjacent to the third stay's check_out
  // must still differ from it.
  it('[TRIANGULATE] a fourth stay adjacent to the third stays checkout still differs from it', () => {
    const stayA = stay('stay-a', '2026-09-01', '2026-09-03')
    const stayB = stay('stay-b', '2026-09-04', '2026-09-05')
    const stayC = stay('stay-c', '2026-09-06', '2026-09-08')
    const stayD = stay('stay-d', '2026-09-08', '2026-09-10') // adjacent to C's checkout

    const slots = assignPastelSlots([stayA, stayB, stayC, stayD])

    expect(slots.get('stay-d')).not.toBe(slots.get('stay-c'))
  })

  it('assigns a stable slot regardless of the input array order (sorts by check_in itself)', () => {
    const stayA = stay('stay-a', '2026-09-08', '2026-09-12')
    const stayB = stay('stay-b', '2026-09-12', '2026-09-15')

    const inCheckInOrder = assignPastelSlots([stayA, stayB])
    const reversed = assignPastelSlots([stayB, stayA])

    expect(reversed.get('stay-a')).toBe(inCheckInOrder.get('stay-a'))
    expect(reversed.get('stay-b')).toBe(inCheckInOrder.get('stay-b'))
  })

  // Not a tautology: proves the adjacency-aware correction branch itself
  // fires on a genuine collision, rather than passing only because a plain
  // `index % 3` rotation happens never to collide for two stays that are
  // immediately consecutive in check_in order (which is mathematically
  // guaranteed for any two non-overlapping, genuinely adjacent stays --
  // see `pastels.ts`'s own module doc). A colliding pair only arises when
  // two OTHER stays' check_in dates tie with the shared adjacency boundary,
  // pushing the true adjacent partner three slots further down the
  // rotation than its immediate array neighbor -- exactly the shape a
  // "compare only against the previous stay" implementation would miss.
  it('[TRIANGULATE] corrects a collision three slots apart, not just against the immediately preceding stay', () => {
    const outgoing = stay('outgoing', '2026-09-01', '2026-09-05') // slot 0
    const fillerOne = stay('filler-one', '2026-09-05', '2026-09-06') // ties on 09-05, slot 1
    const fillerTwo = stay('filler-two', '2026-09-05', '2026-09-07') // ties on 09-05, slot 2
    const incoming = stay('incoming', '2026-09-05', '2026-09-09') // ties on 09-05, naive slot 0 -- collides with `outgoing`

    const slots = assignPastelSlots([outgoing, fillerOne, fillerTwo, incoming])

    expect(slots.get('incoming')).not.toBe(slots.get('outgoing'))
  })
})
