import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKeyConstraint, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import UUID, ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

RESERVATION_STATUSES = ("reserved", "cancelled")


class Reservation(Base):
    """A booking for a property. TENANT-SCOPED table -- RLS is applied via
    `app/db/bootstrap.py::TENANT_SCOPED_TABLES` (design D5).

    Composite FKs to `properties`/`clients` (`(tenant_id, x_id) REFERENCES
    x (tenant_id, id)`), not simple `FK(x_id)` -- this is what makes a
    cross-tenant property/client id physically impossible to reference,
    closing the hole a plain FK would leave open even under RLS (design D6).

    Pricing is stored exactly as entered -- `price_per_night` XOR
    `price_total`, enforced by `num_nonnulls`. The effective total is
    derived, never stored (design D7, `app/services/reservations.py`).

    The non-overlap invariant is `reservations_no_overlap`: `EXCLUDE USING
    gist (property_id WITH =, daterange(check_in, check_out, '[)') WITH &&)
    WHERE (status <> 'cancelled')` (design D6). `'[)'` half-open bounds are
    what make `check_out == next check_in` legal (adjacency). The
    `status <> 'cancelled'` predicate (rather than `status = 'reserved'`)
    is fail-closed: a future third status is included in overlap checking
    by default. Requires `btree_gist` (created by
    `app/db/bootstrap.py::create_extensions`) for the `uuid WITH =`
    operator class inside a gist index. Scoping on `property_id` alone is
    sufficient -- it is a globally unique UUID, so `tenant_id` in the
    exclusion expression would be redundant.
    """

    __tablename__ = "reservations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "property_id"],
            ["properties.tenant_id", "properties.id"],
            name="reservations_property_tenant_fk",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "client_id"],
            ["clients.tenant_id", "clients.id"],
            name="reservations_client_tenant_fk",
        ),
        CheckConstraint(
            "num_nonnulls(price_per_night, price_total) = 1",
            name="reservations_price_xor",
        ),
        CheckConstraint(
            "check_out - check_in BETWEEN 1 AND 60",
            name="reservations_nights_range",
        ),
        ExcludeConstraint(
            ("property_id", "="),
            (text("daterange(check_in, check_out, '[)')"), "&&"),
            where=text("status <> 'cancelled'"),
            using="gist",
            name="reservations_no_overlap",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="reserved")
    price_per_night: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    price_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
