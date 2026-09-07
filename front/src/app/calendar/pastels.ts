import type { DateRange } from '../../shared/calendar/segments'

// design D28: pastel assignment lives HERE, in `app/calendar/`, not in
// `shared/calendar/` -- the core "knows no colour" and this function needs
// the property's complete stay list, which `shared/` cannot import without
// breaking the public tree's boundary (the phase 4 placement note in
// `tasks.md`). Reuses `shared/calendar/segments.ts`'s own `DateRange`
// (`{key, start, end}`) rather than a Reservation-domain type -- pastel
// assignment needs only identity plus check_in/check_out ordering, no
// domain fields, so the same domain-free triple the geometry core already
// defines is the right input shape here too.
//
// D28's tripwire against month-boundary colour collisions: this function
// deliberately has NO `month`/date-range parameter. A caller cannot
// accidentally pass a visible-month-filtered slice through a signature
// that would invite it -- it must assemble the property's COMPLETE
// `check_in`-ordered stay list itself before calling this (the "structural
// subtraction" pattern this codebase uses everywhere, e.g. `ApiError`
// lacking `detail`).
export type PastelSlot = 0 | 1 | 2

const SLOT_COUNT = 3

// README's own three pastels: "#DCDEF9, #DDEFE6, #FBE4D6" for the occupied
// bar, plus the matching dot colour ("cabin A dot" / cabin B's green /
// warm) shown beside each stay in "Quién se queda". Colour lives here, in
// `app/calendar/` (D28), never in `shared/calendar/` or `shared/ui/`.
export const PASTEL_BAR_CLASS: Readonly<Record<PastelSlot, string>> = {
  0: 'bg-accent-soft',
  1: 'bg-green-bar',
  2: 'bg-warm-bar',
}

export const PASTEL_DOT_CLASS: Readonly<Record<PastelSlot, string>> = {
  0: 'bg-accent-soft-2',
  1: 'bg-green-dot',
  2: 'bg-warm-dot',
}

/**
 * Assigns each stay one of three rotating colour slots, ordered by
 * `check_in`, guaranteeing two stays sharing an adjacency day (one's
 * `check_out` equals another's `check_in`) never receive the same slot --
 * even when that forces a departure from strict rotation order (D28,
 * month-calendar-rendering spec's "Color-Slot Assignment" requirement).
 *
 * For any two genuinely non-overlapping, date-adjacent stays, sorting by
 * `check_in` places them immediately next to each other in the ordered
 * list (nothing else can start strictly between two dates that touch with
 * no gap), so a plain `index % 3` rotation already never collides for the
 * "real" case. The explicit correction below exists for the general case
 * the design's own wording promises -- e.g. two stays whose `check_in`
 * ties with the shared adjacency boundary, which can push a stay's true
 * adjacent partner further than one slot away in the sorted order.
 */
export function assignPastelSlots(stays: readonly DateRange[]): ReadonlyMap<string, PastelSlot> {
  const orderedByCheckIn = [...stays].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  const slotByKey = new Map<string, PastelSlot>()

  for (const [index, current] of orderedByCheckIn.entries()) {
    const neighborSlots = new Set<PastelSlot>()
    for (const other of orderedByCheckIn) {
      if (other.key === current.key) continue
      const assigned = slotByKey.get(other.key)
      if (assigned === undefined) continue
      if (other.end === current.start || other.start === current.end) {
        neighborSlots.add(assigned)
      }
    }

    let slot = (index % SLOT_COUNT) as PastelSlot
    while (neighborSlots.has(slot)) {
      slot = ((slot + 1) % SLOT_COUNT) as PastelSlot
    }
    slotByKey.set(current.key, slot)
  }

  return slotByKey
}
