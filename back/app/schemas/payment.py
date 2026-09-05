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
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreate(BaseModel):
    amount: Decimal
    # Required, no default -- only the owner knows how a given amount
    # arrived (payment-tracking spec "Payment Method Is A Stored Enum",
    # design D41). A bad value is a Pydantic 422 here; the
    # `payments_method_valid` CHECK is the concurrency-safe backstop for
    # a raw SQL insert (design D11).
    method: Literal["cash", "transfer", "other"]
    paid_on: date | None = None
    note: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reservation_id: uuid.UUID
    amount: Decimal
    # The ORM column is `payment_method` (matching the model/migration);
    # the API field is `method` (matching the payment-tracking spec's
    # wording and `PaymentCreate.method`). `validation_alias` bridges the
    # two on the way in without affecting the JSON key on the way out.
    method: Literal["cash", "transfer", "other"] = Field(validation_alias="payment_method")
    paid_on: date
    note: str | None
    created_at: datetime
    # Required, never null (design D42, payment-tracking spec "Payment
    # Purpose Is Derived From `paid_on`, Never Stored"). There is no ORM
    # column to alias from -- `purpose` is not a property of a payment
    # row, it is a property of a row's POSITION within its reservation's
    # payment list, so it does not exist until `app/services/payments.py`'s
    # `assign_purposes()` runs over the whole list and the router
    # (`app/api/routers/payments.py`) attaches the result to each row
    # before serialization. Deliberately deferred here until both of
    # those existed -- see this phase's Ordering rationale and task
    # 5.3(c)'s note: a required field nobody can populate is not an
    # intermediate state of the system.
    purpose: Literal["deposit", "payment", "refund"]
