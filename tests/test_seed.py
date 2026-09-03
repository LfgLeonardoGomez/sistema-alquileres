"""The seed script must produce 3 tenants -- two tenants hide bugs that leak
in only one direction (design Testing Strategy).

**Deviation, recorded here (Phase 2 apply).** These assertions used to
check the *total* row count in `tenants`, which was valid while `tenants`
was the only table in play. Phase 2 added auth endpoints and isolation
fixtures (`tests/conftest.py::seed_three_tenants`, `test_auth_register.py`,
`test_isolation_login.py`, ...) that legitimately insert additional
tenants into the same session-scoped test database (see
`tests/conftest.py`'s session-scoped, once-per-run reset). Asserting an
exact total count would make this test's pass/fail depend on pytest's
collection order relative to those other files, which is incidental, not a
property of the seed script. These tests now assert on the three known
seed slugs specifically -- the actual guarantee `scripts/seed.py` makes.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

SEED_SLUGS = (
    "mar-del-tuyu-cabins",
    "bariloche-lake-houses",
    "villa-carlos-paz-retreat",
)


def test_seed_produces_the_three_known_tenants(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        count = conn.execute(
            text("SELECT count(*) FROM tenants WHERE slug = ANY(:slugs)"),
            {"slugs": list(SEED_SLUGS)},
        ).scalar()
    assert count == 3


def test_seed_tenant_slugs_are_unique(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        distinct_slugs = conn.execute(
            text("SELECT count(DISTINCT slug) FROM tenants WHERE slug = ANY(:slugs)"),
            {"slugs": list(SEED_SLUGS)},
        ).scalar()
    assert distinct_slugs == 3
