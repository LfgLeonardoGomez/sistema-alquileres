import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Numeric,
    String,
    UniqueConstraint,
    func,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, ExcludeConstraint
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.db.base import Base
from app.models.payment import Payment

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
    `UNIQUE(tenant_id, id)` exists so `payments` can carry a composite FK
    back to this table, the same pattern `properties`/`clients` already
    carry for `reservations`' own FKs (design D6). **Phase 4 gap, closed
    here in Phase 5 apply**: PostgreSQL requires a composite FK's
    referenced column pair to be backed by a unique constraint, and this
    was omitted from the original Phase 4 model even though the
    equivalent was added to `properties`/`clients`. Nothing else about
    this model changes -- the `EXCLUDE` constraint and the non-overlap
    invariant are untouched.
    """

    __tablename__ = "reservations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="reservations_tenant_id_uq"),
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


# `paid_amount` is derived in SQL, never stored (design D7): it is an
# aggregate over another table (payments), so computing it in Python would
# be N+1 on every list endpoint. Defined after the class body (rather than
# inline as a mapped_column) because the correlated subquery needs to
# reference `Reservation.id`, which does not exist as a usable expression
# until the class itself is fully defined. `COALESCE(..., 0)` matters: a
# reservation with zero payments must read as `0`, not `NULL` -- `SUM` over
# zero rows returns NULL by SQL semantics.
Reservation.paid_amount = column_property(
    select(func.coalesce(func.sum(Payment.amount), 0))
    .where(Payment.reservation_id == Reservation.id)
    .correlate_except(Payment)
    .scalar_subquery()
)
