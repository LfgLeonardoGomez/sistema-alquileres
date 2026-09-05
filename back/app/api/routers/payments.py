"""Payment CRUD under a reservation (payment-tracking spec, design D7,
D42).

`POST` creates a payment (positive `amount`) or a refund (negative
`amount`) against a reservation -- the sign is the only discriminator, no
`kind` column. Explicit `session.flush()` before returning (same
rationale as design D6): the `amount <> 0` CHECK violation must raise
while this handler is still on the stack so `app/errors.py` can still
shape a clean 422.

Both routes label `PaymentRead.purpose` via `app/services/payments.py`'s
`assign_purposes()` (design D42) -- purpose is a property of a row's
POSITION within its reservation's payment list, not of the row itself, so
it cannot be a `computed_field` on `PaymentRead` and must be attached
here, over the rows this handler already has in hand. `list_payments`
spends zero extra queries (it already selects the whole list);
`create_payment` re-selects the reservation's payments after its existing
`flush()` -- one extra `SELECT` on the write path, taken so `purpose`'s
absence never means two different things (unset vs. not yet computed).
"""

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.payment import Payment
from app.models.reservation import Reservation
from app.schemas.payment import PaymentCreate, PaymentRead
from app.services.payments import assign_purposes

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
        payment_method=payload.method,
        note=payload.note,
    )
    if payload.paid_on is not None:
        payment.paid_on = payload.paid_on
    session.add(payment)
    session.flush()

    stmt = select(Payment).where(Payment.reservation_id == reservation_id)
    reservation_payments = list(session.execute(stmt).scalars().all())
    payment.purpose = assign_purposes(reservation_payments)[payment.id]
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
    payments = list(session.execute(stmt).scalars().all())
    purposes = assign_purposes(payments)
    for payment in payments:
        payment.purpose = purposes[payment.id]
    return payments
