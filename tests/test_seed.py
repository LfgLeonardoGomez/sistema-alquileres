"""The seed script must produce 3 tenants -- two tenants hide bugs that leak
in only one direction (design Testing Strategy)."""

from sqlalchemy import text
from sqlalchemy.engine import Engine


def test_seed_produces_three_tenants(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM tenants")).scalar()
    assert count == 3


def test_seed_tenant_slugs_are_unique(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        distinct_slugs = conn.execute(
            text("SELECT count(DISTINCT slug) FROM tenants")
        ).scalar()
    assert distinct_slugs == 3
