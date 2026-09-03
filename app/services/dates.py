"""Timezone handling, isolated to this one module (design D7).

`America/Argentina/Buenos_Aires` is used in exactly one place in Phase 4:
`today_ar()`, the boundary `is_completed` compares against. `CURRENT_DATE`
is never used in a SQL query -- "today" is computed once here in Python
and passed down as a plain value, so nothing depends on the database
server's timezone.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

_AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def today_ar() -> date:
    return datetime.now(_AR_TZ).date()
