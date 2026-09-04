"""D17's remaining two standing checks -- what guards the schema once the
one-shot parity check (scripts/verify_schema_parity.py) expires (design
D16).

`test_rls_structural.py` is the third; it needed zero changes to become a
migration test (design D13).

1. `alembic_version` equals the script directory's head. This is what
   makes "one schema construction path" enforceable rather than
   conventional -- if a `create_all()` shortcut is ever reintroduced into
   `conftest.py`, `alembic_version` is absent or stale and this fails.
2. No pending `alembic revision --autogenerate` diff against the migrated
   schema. Catches the most common Alembic failure: a model changed and
   nobody wrote the migration.
"""

import os

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Engine

from app.db.base import Base

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _alembic_config() -> Config:
    config = Config(os.path.join(_REPO_ROOT, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(_REPO_ROOT, "migrations"))
    return config


def test_alembic_version_matches_script_directory_head(migrator_engine: Engine) -> None:
    script = ScriptDirectory.from_config(_alembic_config())
    head = script.get_current_head()

    with migrator_engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()

    assert current == head


def test_no_pending_autogenerate_diff(migrator_engine: Engine) -> None:
    # Design D17 flags a known caveat here: Alembic's reflection of EXCLUDE
    # constraints (`reservations_no_overlap`, design D6) is sometimes
    # incomplete and can produce a permanent phantom diff unrelated to any
    # real drift. Checked empirically before writing this assertion (no
    # `include_object` filter): no such diff is produced against this
    # schema, so none is added here. If a future Alembic upgrade
    # reintroduces one, the fix is a targeted `include_object` exclusion by
    # constraint name, not a broad type-based filter -- and if it turns out
    # noisier than that single exception, delete this test rather than
    # weaken it into something that can no longer fail.
    with migrator_engine.connect() as conn:
        context = MigrationContext.configure(conn)
        diff = compare_metadata(context, Base.metadata)

    assert diff == [], f"Unexpected pending autogenerate diff: {diff}"
