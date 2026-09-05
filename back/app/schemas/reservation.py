"""Reservation I/O models (design D6/D7). No `total`/`completed` field is
ever stored on the ORM model -- both are derived at read time
(`app/services/reservations.py::effective_total`/`is_completed`) and only
ever appear here as Pydantic `computed_field`s, never as a persisted
column (see `tests/test_schema_no_derived_columns.py`).

No `Field(ge=date.today())` or any equivalent exists anywhere in this
module -- retroactive and in-progress stays are explicitly allowed
(design D6, reservation-booking spec "Retroactive Dates Are Allowed").
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, ConfigDict, computed_field, model_validator

from app.services.dates import today_ar
from app.services.reservations import balance as _compute_balance
from app.services.reservations import effective_total as _compute_effective_total
from app.services.reservations import is_completed as _compute_is_completed


class ReservationCreate(BaseModel):
    property_id: uuid.UUID
    client_id: uuid.UUID
    check_in: date
    check_out: date
    price_per_night: Decimal | None = None
    price_total: Decimal | None = None

    @model_validator(mode="after")
    def _exactly_one_price_mode(self) -> Self:
        if (self.price_per_night is None) == (self.price_total is None):
            raise ValueError(
                "Exactly one of price_per_night or price_total must be provided"
            )
        return self


class ReservationUpdate(BaseModel):
    check_in: date | None = None
    check_out: date | None = None
    price_per_night: Decimal | None = None
    price_total: Decimal | None = None


class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID
    client_id: uuid.UUID
    check_in: date
    check_out: date
    status: str
    price_per_night: Decimal | None
    price_total: Decimal | None
    paid_amount: Decimal
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def effective_total(self) -> Decimal:
        return _compute_effective_total(
            price_per_night=self.price_per_night,
            price_total=self.price_total,
            check_in=self.check_in,
            check_out=self.check_out,
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def balance(self) -> Decimal:
        """Design D7/D44: delegates to the status-aware pure function in
        `app.services.reservations` -- never a stored column (see
        `tests/test_schema_no_derived_columns.py`). A cancelled
        reservation's balance is `0` regardless of `effective_total` or
        `paid_amount`; both stay visible on the model unchanged."""
        return _compute_balance(
            status=self.status,
            effective_total=self.effective_total,
            paid_amount=self.paid_amount,
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_completed(self) -> bool:
        return _compute_is_completed(
            status=self.status, check_out=self.check_out, today=today_ar()
        )
