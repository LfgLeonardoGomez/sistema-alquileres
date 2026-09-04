"""The dev-loop command that migrates the database to head and seeds
development data. Retains its module path and command (`python -m
scripts.reset_db`) by the owner's deliberate decision, despite no longer
resetting anything (design D18) -- the name is a retained misnomer, not an
oversight; see README.md.

No `drop_all`, no drop of any kind. `alembic upgrade head` is idempotent
against an already-migrated database, and `scripts/seed.py::run()` is
`ON CONFLICT (slug) DO NOTHING` -- so this command is safely re-runnable.

Usage (from the repo root, via Docker Compose):

    docker compose run --rm api python -m scripts.reset_db
"""

import os

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine

from scripts import seed

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _alembic_config() -> Config:
    config = Config(os.path.join(_REPO_ROOT, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(_REPO_ROOT, "migrations"))
    return config


def main() -> None:
    command.upgrade(_alembic_config(), "head")

    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        seed.run(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
