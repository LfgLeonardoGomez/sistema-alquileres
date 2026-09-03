"""Structural enforcement, not documentation (design D5 / D12 amendment).

Every table that carries a `tenant_id` column MUST have Row-Level Security
enabled, FORCED, and a policy -- otherwise it is a silent isolation hole.
This test replaces a hand-maintained "tenant-scoped tables" manifest, which
drifts. It queries `pg_class`/`information_schema`/`pg_policies` directly,
so it catches a table that was added to `Base.metadata` (and therefore
created by `create_all()`) but never added to
`app.db.bootstrap.TENANT_SCOPED_TABLES`.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

_UNPROTECTED_TENANT_TABLES_QUERY = """
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'tenant_id'
      )
      AND (
        NOT c.relrowsecurity
        OR NOT c.relforcerowsecurity
        OR NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
        )
      )
    ORDER BY c.relname
"""


def test_all_tenant_tables_have_rls(migrator_engine: Engine) -> None:
    with migrator_engine.connect() as conn:
        unprotected = [
            row[0]
            for row in conn.execute(text(_UNPROTECTED_TENANT_TABLES_QUERY))
        ]
    assert unprotected == [], (
        f"Tables with a tenant_id column but missing RLS/FORCE/policy: {unprotected}"
    )


def test_global_table_without_tenant_id_is_not_flagged(migrator_engine: Engine) -> None:
    """Triangulation: `tenants` has no `tenant_id` column and no RLS at all
    (design D5 -- it is a GLOBAL table). The introspection query must not
    flag it, proving the check is driven by column presence, not a
    hardcoded table list."""
    with migrator_engine.connect() as conn:
        unprotected = {
            row[0]
            for row in conn.execute(text(_UNPROTECTED_TENANT_TABLES_QUERY))
        }
        tenants_has_rls = conn.execute(
            text("SELECT relrowsecurity FROM pg_class WHERE relname = 'tenants'")
        ).scalar()
    assert "tenants" not in unprotected
    assert tenants_has_rls is False
