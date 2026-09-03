import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    """The single owner user of a tenant. TENANT-SCOPED table -- RLS is
    applied via `app/db/bootstrap.py::TENANT_SCOPED_TABLES` (design D5).

    Login identifier is `email`, unique PER TENANT (design D10) -- never
    globally unique, so a login lookup never has to read this table before
    tenant context exists."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="users_tenant_email_uq"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
