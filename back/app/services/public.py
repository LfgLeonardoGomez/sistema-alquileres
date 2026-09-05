"""Public availability calendar query (design D9). The query is the layer
that matters most of D9's three: it selects only the columns it needs
(`property_id`/`name`, `property_id`/`check_in`/`check_out`), never a
whole ORM entity. If `response_model` is ever widened later by mistake, a
projected query still cannot leak a column it never fetched -- whereas a
`select(Reservation)` would hand over every column regardless of what the
schema declares.

Two independent exclusions apply, and they are not the same kind (design
D9): inactive properties are excluded by an ordinary `deleted_at IS NULL`
predicate (design D8), and cancelled reservations are excluded by
`status != "cancelled"` -- the same predicate the `EXCLUDE` constraint
itself uses (`WHERE (status <> 'cancelled')`, `app/models/reservation.py`),
so the public calendar never contradicts the database about which nights
are actually bookable. This second exclusion is not named anywhere in the
Phase 6 task list; it is required by the reservation-booking spec's
non-overlap invariant and by simple correctness -- a cancelled reservation
showing as "occupied" here would hide real availability from prospects.
"""

import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.property import Property
from app.models.reservation import Reservation
from app.models.tenant import Tenant
from app.schemas.public import OccupiedRange, PublicAvailability, PublicContact


def get_public_availability(
    session: Session, *, from_: date, to: date
) -> list[PublicAvailability]:
    properties = session.execute(
        select(Property.id, Property.name).where(Property.deleted_at.is_(None))
    ).all()

    occupied_rows = session.execute(
        select(Reservation.property_id, Reservation.check_in, Reservation.check_out)
        .join(Property, Property.id == Reservation.property_id)
        .where(
            Property.deleted_at.is_(None),
            Reservation.status != "cancelled",
            Reservation.check_in < to,
            Reservation.check_out > from_,
        )
    ).all()

    occupied_by_property: dict[uuid.UUID, list[OccupiedRange]] = defaultdict(list)
    for property_id, check_in, check_out in occupied_rows:
        occupied_by_property[property_id].append(
            OccupiedRange(check_in=check_in, check_out=check_out)
        )

    return [
        PublicAvailability(
            property_id=property_id,
            name=name,
            occupied=occupied_by_property.get(property_id, []),
        )
        for property_id, name in properties
    ]


def get_public_contact(session: Session, *, slug: str) -> PublicContact | None:
    """Design D40 -- a column projection over `tenants` only, no join to any
    tenant-scoped table. Deliberately a second lookup rather than widening
    `PublicSessionDep` to carry tenant columns (see that dependency's own
    docstring). Returns `None` when the slug does not resolve to a row; the
    router turns that into a 404 -- in practice `PublicSessionDep` already
    validated the slug before this runs, so this is a defensive branch, not
    a reachable one on a normal request, matching `GET /tenant`'s own
    defensive `None` check in `app/api/routers/tenant.py`."""
    row = session.execute(
        select(Tenant.name, Tenant.whatsapp).where(Tenant.slug == slug)
    ).first()
    if row is None:
        return None
    name, whatsapp = row
    return PublicContact(name=name, whatsapp=whatsapp)
