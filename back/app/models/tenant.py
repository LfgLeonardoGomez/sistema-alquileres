import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Tenant(Base):
    """A cabin rental owner. GLOBAL table -- no `tenant_id` column, read
    by login and the public routes before any tenant context exists
    (design D5). As of migration `0002` it carries per-command Row-Level
    Security (design D38, amending D5): `ENABLE`d but not `FORCE`d, since
    `alquileres_app` is not the table owner and plain `ENABLE` binds it
    completely. `whatsapp` is the only writable column, and only via
    `PATCH /tenant` -- everything else here is immutable after
    registration."""

    __tablename__ = "tenants"
    __table_args__ = (
        CheckConstraint(
            "whatsapp ~ '^[0-9]{8,15}$'", name="tenants_whatsapp_format"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    whatsapp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
