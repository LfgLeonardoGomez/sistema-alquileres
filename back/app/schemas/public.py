"""Public-facing schemas for the unauthenticated availability calendar
(design D9, layer 2 of 3). These share NO base class with any
authenticated schema in `app/schemas/*.py` -- a shared base class would
let a field added for an authenticated model accidentally inherit into
the public one. `ConfigDict(extra="forbid")` means an unexpected extra
field passed into these models raises instead of silently serializing.
"""

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class OccupiedRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    check_in: date
    check_out: date


class PublicAvailability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    property_id: uuid.UUID
    name: str
    occupied: list[OccupiedRange]


class PublicContact(BaseModel):
    """The second public surface (design D40). Deliberately shares no base
    class with `PublicAvailability` above or with any authenticated schema
    (D9 layer 2) -- a shared base would let a field added for one public
    model accidentally inherit into the other."""

    model_config = ConfigDict(extra="forbid")

    name: str
    whatsapp: str | None
