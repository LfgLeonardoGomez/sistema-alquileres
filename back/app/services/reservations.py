"""Reservation creation and derived-value helpers (design D6/D7).

`create_reservation()` calls `session.flush()` explicitly before returning
(design D6): the exclusion-constraint violation (`23P01`) must raise while
this request's handler is still on the stack, or the response has already
started to build by the time COMMIT happens in the `TenantSessionDep`
dependency and the `IntegrityError` handler (`app/errors.py`) can no
longer shape a clean 409.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app import errors
from app.models.property import Property
from app.models.reservation import Reservation


def effective_total(
    *,
    price_per_night: Decimal | None,
    price_total: Decimal | None,
    check_in: date,
    check_out: date,
) -> Decimal:
    """Pure function (design D7): derive in Python, never store. `total`
    is `price_total` when present, otherwise `price_per_night * nights`.
    Because this recomputes from the currently stored dates every time,
    extending `check_out` on a per-night reservation rescales the total
    automatically -- no extra logic, no stored intermediate value."""
    if price_total is not None:
        return price_total
    nights = (check_out - check_in).days
    assert price_per_night is not None  # guaranteed by the DB CHECK / Pydantic XOR
    return price_per_night * nights


def is_completed(*, status: str, check_out: date, today: date) -> bool:
    """Pure function (design D7): presentation-only, computed in Python
    against a `today` passed in by the caller (`app.services.dates.today_ar()`)
    -- never `CURRENT_DATE` in SQL, so this has zero dependency on the
    database server's timezone."""
    return status == "reserved" and check_out < today


def balance(*, status: str, effective_total: Decimal, paid_amount: Decimal) -> Decimal:
    """Pure function (design D44): a cancelled reservation owes nothing,
    so its balance reads `0` regardless of `effective_total` or of any
    amount recorded in `payments` -- the payments stay individually
    visible elsewhere (`paid_amount`, the payments list endpoint), only
    this derived number collapses. Placed beside `is_completed`, which
    already consults `status`; before this function existed `balance`'s
    arithmetic ignored `status` entirely, which was the asymmetry."""
    if status == "cancelled":
        return Decimal(0)
    return effective_total - paid_amount


def create_reservation(
    session: Session,
    *,
    tenant_id: uuid.UUID,
    property_id: uuid.UUID,
    client_id: uuid.UUID,
    check_in: date,
    check_out: date,
    price_per_night: Decimal | None,
    price_total: Decimal | None,
) -> Reservation:
    """Create a reservation. Rejects (422) a target property that exists
    but is soft-deleted (design D8's "no new reservations on an inactive
    property" rule) -- this is the ONE application-enforced invariant in
    the whole design, deliberately, because a DB-level rule here would
    need a trigger or a denormalised copy of `properties.deleted_at`.

    A property that does not exist at all (wrong id, or belongs to
    another tenant and is therefore RLS-hidden) is NOT checked here --
    the composite FK on `reservations` raises `23503` on flush, mapped to
    404 by `app/errors.py`, which is the correct answer either way (design
    D11: "cannot distinguish belongs-to-another-tenant from
    never-existed").
    """
    property_ = session.get(Property, property_id)
    if property_ is not None and property_.deleted_at is not None:
        raise errors.invalid("Cannot create a reservation on an inactive property")

    reservation = Reservation(
        tenant_id=tenant_id,
        property_id=property_id,
        client_id=client_id,
        check_in=check_in,
        check_out=check_out,
        price_per_night=price_per_night,
        price_total=price_total,
    )
    session.add(reservation)
    session.flush()
    return reservation
