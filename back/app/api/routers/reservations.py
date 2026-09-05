"""Reservation CRUD + cancel (reservation-booking spec, design D6/D7).

`POST` goes through `app.services.reservations.create_reservation()`
(explicit `flush()` for the D6 409 mapping). `PATCH` re-validates the
non-overlap invariant and night bounds exactly as at creation, because it
is the same `flush()`-then-constraint path on the same table -- no
separate re-validation code is needed (reservation-booking spec
"Reservation Editing Respects the Invariant").
"""

import uuid
from datetime import date
from typing import Annotated

# `status` is imported under an alias here, unlike the sibling routers:
# `list_reservations` below takes a `status` query parameter, which would
# otherwise shadow the FastAPI module for that whole function body.
from fastapi import APIRouter, Query
from fastapi import status as http_status
from sqlalchemy import func, select

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.reservation import Reservation
from app.schemas.reservation import ReservationCreate, ReservationRead, ReservationUpdate
from app.services.reservations import create_reservation

router = APIRouter(tags=["reservations"])


@router.post(
    "/reservations",
    response_model=ReservationRead,
    status_code=http_status.HTTP_201_CREATED,
)
def create_reservation_endpoint(
    payload: ReservationCreate, principal: PrincipalDep, session: TenantSessionDep
) -> Reservation:
    return create_reservation(
        session,
        tenant_id=principal.tenant_id,
        property_id=payload.property_id,
        client_id=payload.client_id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        price_per_night=payload.price_per_night,
        price_total=payload.price_total,
    )


@router.get("/reservations", response_model=list[ReservationRead])
def list_reservations(
    session: TenantSessionDep,
    property_id: Annotated[uuid.UUID | None, Query()] = None,
    client_id: Annotated[uuid.UUID | None, Query()] = None,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: Annotated[date | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
) -> list[Reservation]:
    # FastAPI cannot express "both or neither" in the signature -- an
    # explicit guard in the handler body (design D43).
    if (from_ is None) != (to is None):
        raise errors.invalid("from and to must be supplied together")
    if from_ is not None and to is not None and from_ >= to:
        # An inverted or zero-width window is a caller mistake, not an
        # empty-list answer: letting `daterange()` itself raise would
        # surface as a 500, and the house rule is that the app layer
        # produces the error while the database stays the authority
        # (design D43).
        raise errors.invalid("from must be before to")

    # design D43: check_in is the primary key so date-ordered lists and
    # calendars don't sort by insertion order; created_at is the stable
    # tie-break for two stays starting the same day.
    stmt = select(Reservation).order_by(Reservation.check_in, Reservation.created_at)
    if property_id is not None:
        stmt = stmt.where(Reservation.property_id == property_id)
    if client_id is not None:
        stmt = stmt.where(Reservation.client_id == client_id)
    if from_ is not None and to is not None:
        # design D43: the same `daterange && daterange` expression the
        # `reservations_no_overlap` EXCLUDE constraint uses -- never a
        # hand-rolled `check_in < to AND check_out > from_` boundary
        # comparison, so the filter and the constraint cannot disagree
        # about what "overlap" means.
        stay = func.daterange(Reservation.check_in, Reservation.check_out, "[)")
        window = func.daterange(from_, to, "[)")
        stmt = stmt.where(stay.op("&&")(window))
    if status is not None:
        stmt = stmt.where(Reservation.status == status)
    return list(session.execute(stmt).scalars().all())


@router.get("/reservations/{reservation_id}", response_model=ReservationRead)
def get_reservation(reservation_id: uuid.UUID, session: TenantSessionDep) -> Reservation:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise errors.not_found("Reservation not found")
    return reservation


@router.patch("/reservations/{reservation_id}", response_model=ReservationRead)
def update_reservation(
    reservation_id: uuid.UUID, payload: ReservationUpdate, session: TenantSessionDep
) -> Reservation:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise errors.not_found("Reservation not found")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(reservation, field, value)
    # Explicit flush (design D6, same rationale as POST): a re-validated
    # overlap or a nights-bound violation must raise while this handler is
    # still on the stack.
    session.flush()
    return reservation


@router.post("/reservations/{reservation_id}/cancel", response_model=ReservationRead)
def cancel_reservation(reservation_id: uuid.UUID, session: TenantSessionDep) -> Reservation:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise errors.not_found("Reservation not found")
    reservation.status = "cancelled"
    session.flush()
    return reservation
