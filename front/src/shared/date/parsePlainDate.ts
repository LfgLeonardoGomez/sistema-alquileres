import { Temporal } from 'temporal-polyfill'

// design D26: every date in this system is a plain calendar date -- three
// integers, no time, no zone -- represented as the exact `YYYY-MM-DD`
// string the API sent and expects back. There is no conversion to or from
// the JS `Date` object anywhere in this module or anywhere else in the app
// (`Date` is banned by lint): `Temporal.PlainDate` has no instant to be off
// by one on, because turning one into an instant requires naming a time
// zone explicitly, which nothing in this app does.
export type PlainDate = string & { readonly __plainDate: unique symbol }

const PLAIN_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses an API date string into a `PlainDate`.
 *
 * The regex gate runs *before* Temporal ever sees the string. It is not
 * there to validate the calendar -- `overflow: 'reject'` does that, and
 * rejects a calendar-invalid date such as `2026-02-30`. It is there to
 * reject anything carrying a time or an offset (`2026-09-03T00:00:00Z`),
 * which `Temporal.PlainDate.from` would otherwise happily truncate,
 * silently laundering an instant into a plain date.
 */
export function parsePlainDate(raw: string): PlainDate {
  if (!PLAIN_DATE_SHAPE.test(raw)) {
    throw new Error(`Not a plain date (expected YYYY-MM-DD): "${raw}"`)
  }

  return Temporal.PlainDate.from(raw, { overflow: 'reject' }).toString() as PlainDate
}
