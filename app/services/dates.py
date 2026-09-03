"""Timezone handling, isolated to this one module (design D7).

`America/Argentina/Buenos_Aires` is used in exactly one place in Phase 4:
`today_ar()`, the boundary `is_completed` compares against. `CURRENT_DATE`
is never used in a SQL query -- "today" is computed once here in Python
and passed down as a plain value, so nothing depends on the database
server's timezone.

`month_window`/`week_window` (Phase 6, design "Interfaces" section) are
pure functions with no DB access -- the caller computes the half-open
`[from, to)` window as an AR local date pair and the dashboard/public
query paths only ever see plain dates.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

_AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def today_ar() -> date:
    return datetime.now(_AR_TZ).date()


def month_window(year: int, month: int) -> tuple[date, date]:
    """`[first_of_month, first_of_next_month)`. December rolls into
    January of the following year rather than an invalid month 13."""
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


def week_window(any_date: date) -> tuple[date, date]:
    """ISO Monday-Sunday: `[monday, monday + 7 days)`. `any_date.weekday()`
    is `0` for Monday, so subtracting it always lands on that week's
    Monday, including when `any_date` already is one."""
    monday = any_date - timedelta(days=any_date.weekday())
    return monday, monday + timedelta(days=7)
