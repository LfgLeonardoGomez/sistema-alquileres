import { occupiedNightsFor } from './occupancy'

// task 5.6, D34 (type-level, D36's Types layer): `excludeReservationId` is
// a REQUIRED parameter with no default. This is a `*.test-d.ts` file --
// checked by `tsc -b`, not `vitest run` (1.16/1.17's own established
// precedent) -- because the guarantee this task cares about ("forgetting
// is a compile error") only exists at the type level; a runtime test could
// only ever prove one call site remembered, never that every future call
// site is FORCED to.

// @ts-expect-error -- `occupiedNightsFor` requires a second argument;
// `excludeReservationId` has no default (D34: "a default of `null` was
// considered and rejected on exactly the grounds that make defaults
// dangerous elsewhere in this project").
occupiedNightsFor([])

// Sanity check the legal call shape compiles -- the create wizard's own
// call site (5.7), writing `null` explicitly rather than omitting it.
occupiedNightsFor([], { excludeReservationId: null })
occupiedNightsFor([], { excludeReservationId: 'some-reservation-id' })
