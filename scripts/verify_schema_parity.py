"""One-shot mechanical proof that the Alembic-built schema is identical to
the schema `app/db/bootstrap.py` has been building until now (design D16).

**This check is a one-shot gate, not a standing net.** It is possible only
while a throwaway database can still be rebuilt twice in a row -- the
moment real data exists, this script's second pass (`drop_all` +
`upgrade head`) would destroy it. It runs against the dedicated
`db-parity` Compose service, never against `db`/`db-test`, and it is
deleted (along with `db-parity`/`parity`) in the same commit that deletes
`bootstrap.py` (commit 8 of slice 1). What survives it is
`tests/test_schema_is_migrated.py` (design D17).

Usage (from the repo root, via Docker Compose):

    docker compose run --rm parity

The two passes, in the one throwaway database `MIGRATOR_DATABASE_URL`
points at:

  1. `bootstrap.reset_database(engine)` -> snapshot A
  2. `DROP TABLE IF EXISTS alembic_version` -- REQUIRED. Without it, a
     leftover version row from a previous `parity` run makes
     `alembic upgrade head` a silent no-op, and the diff below would
     compare a schema against itself -- a green result that means
     nothing.
  3. `Base.metadata.drop_all(engine)`
  4. `alembic upgrade head` (in-process, via `alembic.config.Config` +
     `alembic.command`) -> snapshot B
  5. Compare A and B. Any difference prints the symmetric diff and exits
     non-zero.

What the snapshot covers (design D16's table, restated as code):

  - `information_schema.columns` -- column/type/length/precision/nullable/
    default drift
  - `pg_constraint` via `pg_get_constraintdef(oid)` -- CHECKs, uniques,
    composite FKs, and the EXCLUDE constraint's definition text
  - `pg_indexes` -- missing or extra indexes
  - `pg_class.relrowsecurity` / `relforcerowsecurity` -- RLS enabled/forced
  - `pg_policies` (`roles`, `qual`, `with_check`) -- the two named traps:
    a dropped role on the policy, or a predicate that drifted from
    `app.tenant_id`
  - `information_schema.role_table_grants` -- a missing GRANT
  - `pg_extension` -- a missing `btree_gist`

`alembic_version` and its row are excluded from both snapshots -- it is
Alembic's own bookkeeping table, not part of the reproduced schema.
"""

import os
import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text

from app.db import bootstrap

Snapshot = dict[str, set[tuple]]

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_COLUMNS_QUERY = """
    SELECT table_name, column_name, data_type, character_maximum_length,
           numeric_precision, numeric_scale, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> 'alembic_version'
"""

_CONSTRAINTS_QUERY = """
    SELECT c.conrelid::regclass::text AS table_name,
           c.conname,
           c.contype,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conrelid::regclass::text <> 'alembic_version'
"""

_INDEXES_QUERY = """
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename <> 'alembic_version'
"""

_RLS_QUERY = """
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'alembic_version'
"""

_POLICIES_QUERY = """
    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
"""

_GRANTS_QUERY = """
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name <> 'alembic_version'
"""

_EXTENSIONS_QUERY = """
    SELECT extname FROM pg_extension
"""


def _rows(engine: Engine, query: str) -> set[tuple]:
    with engine.connect() as conn:
        return {_normalize(row) for row in conn.execute(text(query))}


def _normalize(row) -> tuple:
    return tuple(tuple(v) if isinstance(v, list) else v for v in row)


def _snapshot(engine: Engine) -> Snapshot:
    return {
        "columns": _rows(engine, _COLUMNS_QUERY),
        "constraints": _rows(engine, _CONSTRAINTS_QUERY),
        "indexes": _rows(engine, _INDEXES_QUERY),
        "rls": _rows(engine, _RLS_QUERY),
        "policies": _rows(engine, _POLICIES_QUERY),
        "grants": _rows(engine, _GRANTS_QUERY),
        "extensions": _rows(engine, _EXTENSIONS_QUERY),
    }


def _alembic_config() -> Config:
    config = Config(os.path.join(_REPO_ROOT, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(_REPO_ROOT, "migrations"))
    return config


def _diff(a: Snapshot, b: Snapshot) -> dict[str, tuple[set[tuple], set[tuple]]]:
    diffs = {}
    for category in a:
        only_in_bootstrap = a[category] - b[category]
        only_in_migrated = b[category] - a[category]
        if only_in_bootstrap or only_in_migrated:
            diffs[category] = (only_in_bootstrap, only_in_migrated)
    return diffs


def run(engine: Engine) -> dict[str, tuple[set[tuple], set[tuple]]]:
    # Pass 1: the schema app/db/bootstrap.py has been building.
    bootstrap.reset_database(engine)
    snapshot_a = _snapshot(engine)

    # Required -- see module docstring. Without dropping a leftover
    # alembic_version row, `upgrade head` below is a silent no-op and
    # snapshot_b would just be snapshot_a again.
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))

    bootstrap.Base.metadata.drop_all(engine)

    # Pass 2: the schema migrations/versions/0001_baseline.py builds.
    command.upgrade(_alembic_config(), "head")
    snapshot_b = _snapshot(engine)

    return _diff(snapshot_a, snapshot_b)


def main() -> None:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        diffs = run(engine)
    finally:
        engine.dispose()

    if not diffs:
        print("Schema parity: OK -- bootstrap-built and Alembic-built schemas match.")
        return

    print("Schema parity: MISMATCH")
    for category, (only_in_bootstrap, only_in_migrated) in diffs.items():
        print(f"\n[{category}]")
        if only_in_bootstrap:
            print("  Only in bootstrap-built schema:")
            for row in sorted(only_in_bootstrap, key=repr):
                print(f"    {row}")
        if only_in_migrated:
            print("  Only in Alembic-built schema:")
            for row in sorted(only_in_migrated, key=repr):
                print(f"    {row}")
    sys.exit(1)


if __name__ == "__main__":
    main()
