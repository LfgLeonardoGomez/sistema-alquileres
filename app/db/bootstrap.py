"""Schema bootstrap -- the single authoritative place that recreates the
whole database schema, in order: extension -> tables -> RLS -> grants.

This REPLACES Alembic for the duration of active schema development (see
engram: architecture/schema-bootstrap, and design.md D12 as amended). It is
idempotent BY RECREATION, not a migration: every run drops and rebuilds. Do
not add logic here that tries to preserve data.

`create_all()` alone would create tables but skip RLS policies and grants --
tenant isolation would silently not exist. Every table that is tenant-scoped
MUST be added to TENANT_SCOPED_TABLES in the same change that creates it, or
this bootstrap creates an unprotected table. The `pg_class`/`pg_policies`
introspection test (added in a later slice) is the gate that catches this.
"""

from sqlalchemy import Engine, text

from app.db.base import Base

# Importing model modules registers their tables on Base.metadata. Add each
# new model import here as it's created.
from app.models import tenant as _tenant  # noqa: F401
from app.models import user as _user  # noqa: F401

APP_ROLE = "alquileres_app"
MIGRATOR_ROLE = "alquileres_migrator"

# Tables carrying a `tenant_id` column, in the order they must be enabled.
# `tenants` itself is GLOBAL and deliberately excluded (design D5). Every
# other table added to Base.metadata MUST be listed here in the same commit
# that creates it -- test_rls_structural.py is the safety net that catches
# a table created without RLS.
TENANT_SCOPED_TABLES: tuple[str, ...] = ("users",)


def create_extensions(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))


def create_schema(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def apply_row_level_security(engine: Engine) -> None:
    """Enable RLS + FORCE + a `tenant_isolation` policy + grants on every
    tenant-scoped table. This is the ONE place this DDL lives.

    **Deviation from design D5's literal example, recorded here.** D5's
    snippet scopes the policy `TO alquileres_app` only. FORCE ROW LEVEL
    SECURITY makes RLS apply to the table owner too (that is its entire
    purpose -- see D5's "belt" comment), and in Postgres a role with no
    applicable policy gets zero rows, full stop -- FORCE does not grant the
    owner an implicit bypass, it only removes the owner's *default*
    exemption. `alquileres_migrator` (the owner) therefore also needs to be
    a named role on the same policy, or the migrator could never seed
    tenant-scoped fixture data (task 2.20 explicitly seeds users via
    `alquileres_migrator`) or run application code paths in a maintenance
    context. Both roles go through the identical `tenant_id` predicate --
    this is NOT a bypass, BYPASSRLS is never granted to either role, and
    the migrator must set `app.tenant_id` the same way the app does before
    any tenant-scoped write succeeds."""
    with engine.begin() as conn:
        for table in TENANT_SCOPED_TABLES:
            conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
            conn.execute(
                text(
                    f"""
                    CREATE POLICY tenant_isolation ON {table}
                      FOR ALL TO {APP_ROLE}, {MIGRATOR_ROLE}
                      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                    """
                )
            )
            conn.execute(
                text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
            )


def grant_global_tables(engine: Engine) -> None:
    """Global tables carry no RLS but still need explicit grants -- the app
    role reads/writes `tenants` during registration and login (D5)."""
    with engine.begin() as conn:
        conn.execute(text(f"GRANT SELECT, INSERT ON tenants TO {APP_ROLE}"))


def reset_database(engine: Engine) -> None:
    """Drop and rebuild everything this bootstrap owns, in order. Never
    drops the "public" schema itself -- only the tables SQLAlchemy tracks --
    so the one-time schema-level grants in docker/initdb/01-roles.sql
    survive every reset."""
    create_extensions(engine)
    Base.metadata.drop_all(engine)
    create_schema(engine)
    apply_row_level_security(engine)
    grant_global_tables(engine)
