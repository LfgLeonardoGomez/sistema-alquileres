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
