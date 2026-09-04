"""Alembic environment.

Reads `MIGRATOR_DATABASE_URL` directly from the process environment -- the
same variable `scripts/reset_db.py` and `scripts/seed.py` already use, and
the only variable Alembic is ever pointed at (the API process never holds
migrator credentials, see design D20).

`target_metadata = Base.metadata` is deliberately allowed here (design D14):
this file is NOT a snapshot, it tracks HEAD, and Alembic's autogenerate
needs live metadata to diff against. Individual revision files under
`migrations/versions/` are the ones that MUST NOT import `app.models` or
`Base.metadata` -- a revision is a snapshot of one moment in time.

Population of `Base.metadata` (importing the six model modules so they
register their tables) is deliberately NOT this module's job. Until commit
8 of this change, `app/db/bootstrap.py` still exists and its import (kept
alive by `tests/conftest.py` for exactly this side effect) populates
`Base.metadata` earlier in the same test process, before this module ever
runs. From commit 8 onward, `app/models/__init__.py` takes over that role.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_url() -> str:
    return os.environ["MIGRATOR_DATABASE_URL"]


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection, emitting SQL to stdout."""
    context.configure(
        url=_get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
