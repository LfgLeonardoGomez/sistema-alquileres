"""The bootstrap script is the single authoritative place that creates the
extension the EXCLUDE constraint (D6) will depend on in a later slice, and
the tenants table (tenant-management spec). See engram:
architecture/schema-bootstrap for why this replaces Alembic in this project.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine


def test_bootstrap_creates_btree_gist_extension(migrator_engine: Engine) -> None:
    with migrator_engine.connect() as conn:
        found = conn.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'")
        ).scalar()
    assert found == 1


def test_bootstrap_creates_tenants_table(migrator_engine: Engine) -> None:
    with migrator_engine.connect() as conn:
        table = conn.execute(text("SELECT to_regclass('public.tenants')")).scalar()
    assert table == "tenants"
