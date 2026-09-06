// task 4.17/4.18. The corrected `reservation-ledger` spec's own words:
// "the frontend's correctness here MUST NOT depend on the backend's, or a
// future regression in one becomes a wrong number shown to the owner about
// her own money with nothing in between." This is that independent
// guarantee -- defence in depth, deliberately kept even though the backend
// bug it once compensated for (a cancelled reservation reporting a
// non-zero `balance`) was fixed and archived in `frontend-api-alignment`.
// One function, one rule: a cancelled stay never shows an amount owed,
// regardless of what number the API happens to report for it.
export type BalanceInput = {
  readonly status: string
  readonly balance: number
}

export function displayBalance({ status, balance }: BalanceInput): number {
  return status === 'cancelled' ? 0 : balance
}
