"""baseline

Reproduces the live schema built until now by `app/db/bootstrap.py`, as
literal, self-contained DDL (design D14). This file MUST NOT import
`app.models`, `app.db.base`, `Base.metadata`, or `TENANT_SCOPED_TABLES` --
a migration is a snapshot of one moment, and importing metadata would make
it silently follow the code instead of staying fixed in time. Every table
is written out explicitly with `op.create_table(...)`.

Order (a correctness constraint, not style -- see design D14):
  1. `btree_gist` extension, first (required by `reservations_no_overlap`).
  2. Tables in dependency order: tenants, users, properties, clients,
     reservations, payments -- every CHECK, every composite
     `UNIQUE (tenant_id, id)` FK target, the full `UNIQUE (tenant_id, phone)`
     on clients, and the composite FKs.
  3. `reservations_no_overlap` via literal `op.execute()` -- Alembic's
     `ExcludeConstraint` round-trip through autogenerate is unreliable;
     literal DDL removes the question.
  4. For each tenant-scoped table: ENABLE ROW LEVEL SECURITY, FORCE ROW
     LEVEL SECURITY, the `tenant_isolation` policy, and the app role's
     grant.
  5. `GRANT SELECT, INSERT ON tenants TO alquileres_app` -- the global
     table (design D5) carries no RLS but still needs its grant.
  6. No grant of any kind on `alembic_version` -- the app role has no
     business reading it.

The two named traps (design D14), checked here by construction:

- The RLS predicate is copied verbatim from
  `app/db/bootstrap.py::apply_row_level_security`:
  `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`
  -- never `app.current_tenant_id`, never `SET LOCAL`. A migration written
  from stale wording would compare against a setting nobody sets, get
  NULL, and deny every row on every request while the application starts
  perfectly cleanly.
- Every policy names both roles, `FOR ALL TO alquileres_app,
  alquileres_migrator`. `FORCE ROW LEVEL SECURITY` subjects the table
  owner (`alquileres_migrator`) to RLS too -- that is its entire purpose
  -- and a role with no applicable policy on a forced table gets zero
  rows, not an implicit bypass. Without the migrator named here, seeding
  and every fixture that inserts as `alquileres_migrator` breaks
  immediately.

Revision ID: 0001
Revises:
Create Date: 2026-09-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "alquileres_app"
MIGRATOR_ROLE = "alquileres_migrator"

# Copied verbatim from app/db/bootstrap.py::apply_row_level_security.
# NEVER `app.current_tenant_id`, NEVER `SET LOCAL` -- see module docstring.
_TENANT_ID_PREDICATE = (
    "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid"
)

# Tables carrying a `tenant_id` column, in the order their RLS is applied.
# `tenants` itself is GLOBAL and deliberately excluded (design D5).
_TENANT_SCOPED_TABLES: tuple[str, ...] = (
    "users",
    "properties",
    "clients",
    "reservations",
    "payments",
)


def _apply_row_level_security(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON {table}
          FOR ALL TO {APP_ROLE}, {MIGRATOR_ROLE}
          USING ({_TENANT_ID_PREDICATE})
          WITH CHECK ({_TENANT_ID_PREDICATE})
        """
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def upgrade() -> None:
    # 1. Extension, first -- reservations_no_overlap depends on it.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    # 2. Tables, in dependency order.
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("slug", name="tenants_slug_key"),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("tenant_id", "email", name="users_tenant_email_uq"),
    )

    op.create_table(
        "properties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("tenant_id", "id", name="properties_tenant_id_uq"),
    )

    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("national_id", sa.String(50), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("tenant_id", "id", name="clients_tenant_id_uq"),
        sa.UniqueConstraint("tenant_id", "phone", name="clients_tenant_phone_uq"),
    )

    op.create_table(
        "reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("check_in", sa.Date(), nullable=False),
        sa.Column("check_out", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("price_per_night", sa.Numeric(12, 2), nullable=True),
        sa.Column("price_total", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("tenant_id", "id", name="reservations_tenant_id_uq"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "property_id"],
            ["properties.tenant_id", "properties.id"],
            name="reservations_property_tenant_fk",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "client_id"],
            ["clients.tenant_id", "clients.id"],
            name="reservations_client_tenant_fk",
        ),
        sa.CheckConstraint(
            "num_nonnulls(price_per_night, price_total) = 1",
            name="reservations_price_xor",
        ),
        sa.CheckConstraint(
            "check_out - check_in BETWEEN 1 AND 60",
            name="reservations_nights_range",
        ),
    )

    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reservation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("tenant_id", "id", name="payments_tenant_id_uq"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "reservation_id"],
            ["reservations.tenant_id", "reservations.id"],
            name="payments_reservation_tenant_fk",
        ),
        sa.CheckConstraint("amount <> 0", name="payments_amount_nonzero"),
    )

    # 3. reservations_no_overlap -- literal DDL, not ExcludeConstraint's
    # unreliable autogenerate round-trip (design D14).
    op.execute(
        """
        ALTER TABLE reservations
          ADD CONSTRAINT reservations_no_overlap
          EXCLUDE USING gist (
            property_id WITH =,
            daterange(check_in, check_out, '[)') WITH &&
          )
          WHERE (status <> 'cancelled')
        """
    )

    # 4. RLS + FORCE + policy + grant, per tenant-scoped table.
    for table in _TENANT_SCOPED_TABLES:
        _apply_row_level_security(table)

    # 5. The global table (design D5) carries no RLS but still needs its
    # grant -- the app role reads/writes `tenants` during registration and
    # login.
    op.execute(f"GRANT SELECT, INSERT ON tenants TO {APP_ROLE}")

    # 6. No grant of any kind on alembic_version -- deliberately absent.


def downgrade() -> None:
    # Reverse dependency order. Policies and grants die with their tables.
    # btree_gist is deliberately left installed (design D14): dropping an
    # extension is a cluster-visible side effect, `CREATE EXTENSION IF NOT
    # EXISTS` is idempotent on the way back up, and this cycle runs on
    # every test session.
    op.drop_table("payments")
    op.drop_table("reservations")
    op.drop_table("clients")
    op.drop_table("properties")
    op.drop_table("users")
    op.drop_table("tenants")
