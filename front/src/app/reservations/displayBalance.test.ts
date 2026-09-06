import { describe, expect, it } from 'vitest'
import { displayBalance } from './displayBalance'

// task 4.17/4.18. Wording correction recorded (2026-09-06), not a silent
// rewrite: `design.md`'s D27 calls this "the one helper that knows about
// the cancelled-stay defect" -- the backend bug it names no longer exists
// (fixed and archived in `frontend-api-alignment`,
// `back/app/services/reservations.py` now reports `0` for a cancelled
// reservation's balance). The corrected `reservation-ledger` spec restates
// the requirement as an INDEPENDENT guarantee, not a compensating patch:
// "the frontend's correctness here MUST NOT depend on the backend's, or a
// future regression in one becomes a wrong number shown to the owner about
// her own money with nothing in between." This helper, and this test file,
// exist for that reason -- not because a live defect is being worked
// around. `balance` here is already-decoded integer centavos (D27's decode
// boundary), the same shape `useReservationsForCabin.ts` produces.

describe('displayBalance', () => {
  it('reports zero for a cancelled reservation, regardless of what balance is reported', () => {
    expect(displayBalance({ status: 'cancelled', balance: 45000 })).toBe(0)
  })

  it('[TRIANGULATE] passes a non-cancelled positive balance through unchanged', () => {
    expect(displayBalance({ status: 'confirmed', balance: 8000000 })).toBe(8000000)
  })

  it('[TRIANGULATE] passes a non-cancelled negative balance through unchanged', () => {
    expect(displayBalance({ status: 'confirmed', balance: -2000000 })).toBe(-2000000)
  })
})
