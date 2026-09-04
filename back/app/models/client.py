import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Client(Base):
    """A guest of a tenant. TENANT-SCOPED table -- RLS is applied by
    `migrations/versions/0001_baseline.py` (design D5, D13).

    `UNIQUE(tenant_id, phone)` is a FULL unique constraint -- it spans both
    active AND soft-deleted rows (design D8). This is deliberate, not an
    oversight: a partial index (`WHERE deleted_at IS NULL`) would let a
    soft-deleted row's phone collide silently on re-insert instead of
    hitting the conflict target that `upsert_or_reactivate_client`
    (`app/services/clients.py`) depends on to reactivate the SAME row
    rather than create a duplicate. Including `tenant_id` in the
    constraint (not `phone` alone) also prevents an RLS + unique-index
    existence-oracle leak across tenants (design D8's "classic RLS +
    unique-index leak" note).

    `UNIQUE(tenant_id, id)` exists so `reservations` can carry a composite
    FK back to this table (design D6).
    """

    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="clients_tenant_id_uq"),
        UniqueConstraint("tenant_id", "phone", name="clients_tenant_phone_uq"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    national_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
