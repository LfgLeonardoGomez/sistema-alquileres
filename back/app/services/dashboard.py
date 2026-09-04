"""Dashboard aggregation queries (design "Interfaces" section: "one
endpoint, two windows, two numbers"; owner-dashboard spec).

Both queries run through the caller's tenant-scoped session -- RLS
supplies the tenant filter, so neither query has a manual `tenant_id`
predicate, matching every other tenant-scoped query in this codebase.

The two soft-delete rules here point in opposite directions, deliberately
(design D8):

- `collected` sums payments on ALL properties, active or not. Money
  already received is not un-earned by retiring a cabin, and a retired
  property must not silently rewrite a prior month's income.
- `occupied_nights`/`available_nights` are scoped to ACTIVE properties
  only (`deleted_at IS NULL`). A retired cabin has no nights to sell, so
  including it in either number would report phantom availability or
  phantom occupancy.

Both `collected` and the occupancy query also exclude cancelled
reservations (`status <> 'cancelled'`) -- the same predicate the
`reservations_no_overlap` EXCLUDE constraint uses. This mirrors the
public-calendar gap fix in `app/services/public.py`: a cancelled
reservation's nights are bookable again, so they must read as available
here too, not as occupied.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.payment import Payment


@dataclass(frozen=True)
class PropertyOccupancy:
    property_id: uuid.UUID
    occupied_nights: int
    available_nights: int


def collected(session: Session, *, from_: date, to: date) -> Decimal:
    """Signed sum of `payments.amount` with `paid_on` in `[from_, to)`
    (owner-dashboard spec "collected -- Cash-Basis Income"). Cash basis
    only -- bucketed strictly by payment date, never by the reservation's
    stay dates. Refunds (negative amounts) reduce the total naturally;
    they are never filtered out or absolute-valued."""
    total = session.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.paid_on >= from_, Payment.paid_on < to
        )
    ).scalar_one()
    return Decimal(total)


def occupied_and_available_nights(
    session: Session, *, from_: date, to: date
) -> list[PropertyOccupancy]:
    """One row per ACTIVE property. `occupied_nights` is the length (in
    nights) of the intersection between each non-cancelled reservation's
    stay and the requested window, via Postgres `daterange` intersection
    (`*`) -- the same range algebra the `EXCLUDE` constraint relies on.
    `available_nights` is `nights_in_window - occupied_nights` per
    property, which makes the aggregate self-consistent with design's
    `active_properties * nights_in_window - occupied_nights` formula: it
    is the per-property sum of exactly that.

    The `CASE WHEN r.id IS NULL THEN 0 ELSE ... END` guard matters: it is
    NOT redundant with `COALESCE(SUM(...), 0)`. When the `LEFT JOIN`
    produces no matching reservation, `r.check_in`/`r.check_out` are SQL
    `NULL` -- but `daterange(NULL, NULL, '[)')` does not evaluate to an
    empty/null range, it evaluates to the fully UNBOUNDED range
    `(,)` (Postgres range semantics: a `NULL` bound means "unbounded", not
    "no value"). Intersected with the window, an unbounded range returns
    the *entire* window, silently reporting every property as 100%
    occupied. This was caught by two of this file's own tests failing with
    exactly that symptom (a property with zero reservations, and a
    cancelled-therefore-excluded reservation, both showing full occupancy)
    before this guard was added.
    """
    nights_in_window = (to - from_).days
    rows = session.execute(
        text(
            """
            SELECT
                p.id AS property_id,
                COALESCE(SUM(
                    CASE WHEN r.id IS NULL THEN 0 ELSE
                        upper(daterange(r.check_in, r.check_out, '[)') * daterange(:from_date, :to_date, '[)'))
                        - lower(daterange(r.check_in, r.check_out, '[)') * daterange(:from_date, :to_date, '[)'))
                    END
                ), 0) AS occupied_nights
            FROM properties p
            LEFT JOIN reservations r
                ON r.property_id = p.id
                AND r.status <> 'cancelled'
                AND daterange(r.check_in, r.check_out, '[)') && daterange(:from_date, :to_date, '[)')
            WHERE p.deleted_at IS NULL
            GROUP BY p.id
            """
        ),
        {"from_date": from_, "to_date": to},
    ).all()

    return [
        PropertyOccupancy(
            property_id=row.property_id,
            occupied_nights=row.occupied_nights,
            available_nights=nights_in_window - row.occupied_nights,
        )
        for row in rows
    ]
