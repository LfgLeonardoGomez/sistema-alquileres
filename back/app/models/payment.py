import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKeyConstraint, Numeric, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.services.dates import today_ar


class Payment(Base):
    """A payment (or refund) recorded against a reservation. TENANT-SCOPED
    table -- RLS is applied by `migrations/versions/0001_baseline.py` (design D5, D13).

    Composite FK to `reservations` (`(tenant_id, reservation_id)
    REFERENCES reservations (tenant_id, id)`), the same pattern
    `reservations` itself uses for `properties`/`clients` (design D6) --
    this is what makes a cross-tenant reservation id physically impossible
    to reference, closing the hole a plain `FK(reservation_id)` would
    leave open even under RLS.

    No `kind`/`type` discriminator column. The sign of `amount` IS the
    discriminator (design D7): a positive amount is a payment, a negative
    amount is a refund. `CHECK (amount <> 0)` only rejects zero -- both
    signs are otherwise valid.

    `paid_on` defaults in PYTHON to `today_ar()` (`default=`), never a
    database `server_default`. The database runs in UTC; a server-side
    default would misattribute a payment entered late at night in Buenos
    Aires to the wrong calendar day, which matters because Phase 6's
    `collected` dashboard metric buckets payments by `paid_on`.

    `UNIQUE(tenant_id, id)` exists so a future table could carry a
    composite FK back to this one, the same standing pattern every
    tenant-scoped table in this schema follows (design D6).
    """

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="payments_tenant_id_uq"),
        ForeignKeyConstraint(
            ["tenant_id", "reservation_id"],
            ["reservations.tenant_id", "reservations.id"],
            name="payments_reservation_tenant_fk",
        ),
        CheckConstraint("amount <> 0", name="payments_amount_nonzero"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reservation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False, default=today_ar)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
