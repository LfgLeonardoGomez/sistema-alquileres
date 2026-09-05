import { Temporal } from 'temporal-polyfill'
import { parsePlainDate, type PlainDate } from './parsePlainDate'

const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires'

/**
 * The single source of "today" in this app (design D26), matching the
 * server's own `today_ar()` (`back/app/services/dates.py`). Used for the
 * default calendar month, the "finished stay" reading (`check_out < today`,
 * strictly), and the dashboard window. Nothing else in the frontend knows a
 * time zone exists.
 */
export function todayAR(): PlainDate {
  return parsePlainDate(Temporal.Now.plainDateISO(AR_TIME_ZONE).toString())
}
