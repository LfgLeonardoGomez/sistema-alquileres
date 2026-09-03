"""Reservation CRUD + cancel (reservation-booking spec, design D6/D7).

`POST` goes through `app.services.reservations.create_reservation()`
(explicit `flush()` for the D6 409 mapping). `PATCH` re-validates the
non-overlap invariant and night bounds exactly as at creation, because it
is the same `flush()`-then-constraint path on the same table -- no
separate re-validation code is needed (reservation-booking spec
"Reservation Editing Respects the Invariant").
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.reservation import Reservation
from app.schemas.reservation import ReservationCreate, ReservationRead, ReservationUpdate
from app.services.reservations import create_reservation

router = APIRouter(tags=["reservations"])


@router.post("/reservations", response_model=ReservationRead, status_code=status.HTTP_201_CREATED)
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
) -> list[Reservation]:
    stmt = select(Reservation).order_by(Reservation.created_at)
    if property_id is not None:
        stmt = stmt.where(Reservation.property_id == property_id)
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
