"""Client I/O models. `is_active` MUST NOT be a stored column -- it is a
`computed_field` derived from `deleted_at` at the API boundary (design D8),
same mechanism as `app.schemas.property`.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field


class ClientCreate(BaseModel):
    full_name: str = Field(min_length=1)
    phone: str = Field(min_length=1)
    email: EmailStr | None = None
    national_id: str | None = None


class ClientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1)
    phone: str | None = Field(default=None, min_length=1)
    email: EmailStr | None = None
    national_id: str | None = None


class ClientRead(BaseModel):
    """No `stay_count` and no `outstanding_balance` field exists here, no
    endpoint returns them, and no SQL aggregate computes them -- by design
    (D47), not by omission. A guest's outstanding balance is the plain sum
    of that guest's reservation balances, and since a cancelled reservation
    now reports a `balance` of `0` (D44) that sum is correct by
    construction; `GET /reservations?client_id=` already puts the list in
    the caller's hands.

    The tripwire that reverses this: add the server-side aggregate the day
    a second consumer of this data appears, or the day a screen renders a
    reservation without having loaded that guest's full reservation list.
    Until then a stored or aggregated total would be a second source of
    truth for a number that is already derivable.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str
    email: str | None
    national_id: str | None
    created_at: datetime
    deleted_at: datetime | None = Field(exclude=True, repr=False)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_active(self) -> bool:
        return self.deleted_at is None
