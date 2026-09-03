"""Payment CRUD under a reservation (payment-tracking spec, design D7).

No `app/services/payments.py` module exists -- design D3 lists
`services/` as reserved for the three modules with real logic (pricing,
find-or-create-or-reactivate, aggregation); recording or listing a payment
is a plain insert/select with no comparable logic, so it lives directly in
this router, same as `properties`.

`POST` creates a payment (positive `amount`) or a refund (negative
`amount`) against a reservation -- the sign is the only discriminator, no
`kind` column. Explicit `session.flush()` before returning (same
rationale as design D6): the `amount <> 0` CHECK violation must raise
while this handler is still on the stack so `app/errors.py` can still
shape a clean 422.
"""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.payment import Payment
from app.models.reservation import Reservation
from app.schemas.payment import PaymentCreate, PaymentRead

router = APIRouter(tags=["payments"])


@router.post(
    "/reservations/{reservation_id}/payments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    reservation_id: uuid.UUID,
    payload: PaymentCreate,
    principal: PrincipalDep,
    session: TenantSessionDep,
) -> Payment:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise errors.not_found("Reservation not found")

    payment = Payment(
        tenant_id=principal.tenant_id,
        reservation_id=reservation_id,
        amount=payload.amount,
        note=payload.note,
    )
    if payload.paid_on is not None:
        payment.paid_on = payload.paid_on
    session.add(payment)
    session.flush()
    return payment


@router.get("/reservations/{reservation_id}/payments", response_model=list[PaymentRead])
def list_payments(reservation_id: uuid.UUID, session: TenantSessionDep) -> list[Payment]:
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise errors.not_found("Reservation not found")
    stmt = (
        select(Payment)
        .where(Payment.reservation_id == reservation_id)
        .order_by(Payment.created_at)
    )
    return list(session.execute(stmt).scalars().all())
