"""Payment I/O models (design D7, payment-tracking spec). `amount` is a
plain signed `Decimal` -- there is no separate `kind`/`type` field and no
positivity constraint here; the sign alone discriminates a payment from a
refund, and `amount = 0` is rejected by the DB `CHECK` constraint
(`payments_amount_nonzero`), not by Pydantic (design D11: the CHECK is the
concurrency-safe backstop, same pattern used for reservation night bounds).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PaymentCreate(BaseModel):
    amount: Decimal
    paid_on: date | None = None
    note: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reservation_id: uuid.UUID
    amount: Decimal
    paid_on: date
    note: str | None
    created_at: datetime
