"""Property I/O models. `is_active` MUST NOT be a stored column -- it is a
`computed_field` derived from `deleted_at` at the API boundary (design D8),
per the project's standing "never store a derived value" rule.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field


class PropertyCreate(BaseModel):
    name: str = Field(min_length=1)


class PropertyUpdate(BaseModel):
    name: str = Field(min_length=1)


class PropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime
    deleted_at: datetime | None = Field(exclude=True, repr=False)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_active(self) -> bool:
        return self.deleted_at is None
