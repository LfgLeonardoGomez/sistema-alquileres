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

APP_ROLE = "alquileres_app"

# Tables carrying a `tenant_id` column, in the order they must be enabled.
# Slice 1 ships no tenant-scoped table -- `tenants` itself is GLOBAL and
# deliberately excluded (design D5). Future slices append here, in the same
# commit that creates the table.
TENANT_SCOPED_TABLES: tuple[str, ...] = ()


def create_extensions(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))


def create_schema(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def apply_row_level_security(engine: Engine) -> None:
    """Enable RLS + FORCE + a `tenant_isolation` policy + grants on every
    tenant-scoped table. This is the ONE place this DDL lives."""
    with engine.begin() as conn:
        for table in TENANT_SCOPED_TABLES:
            conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
            conn.execute(
                text(
                    f"""
                    CREATE POLICY tenant_isolation ON {table}
                      FOR ALL TO {APP_ROLE}
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
