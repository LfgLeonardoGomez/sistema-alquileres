import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Property(Base):
    """A rental cabin. TENANT-SCOPED table -- RLS is applied by
    `migrations/versions/0001_baseline.py` (design D5, D13).

    Soft-deleted via `deleted_at` (design D8) -- never physically removed,
    so historical reservations and payments on a retired property stay
    readable and editable. `UNIQUE(tenant_id, id)` exists so `reservations`
    can carry a composite FK back to this table (design D6), closing the
    cross-tenant FK hole a plain `FK(property_id)` would leave open.

    `is_active` is NOT a stored column -- it is derived from `deleted_at`
    at the API boundary (`app/schemas/property.py`), per the project's
    standing "never store a derived value" rule.
    """

    __tablename__ = "properties"
    __table_args__ = (UniqueConstraint("tenant_id", "id", name="properties_tenant_id_uq"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
