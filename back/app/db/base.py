from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base. Every ORM model registers its table here.
    `Base.metadata` is used by `migrations/env.py` for autogenerate diffing
    and by `tests/test_schema_is_migrated.py`'s no-pending-diff check --
    never as the schema's own source of truth. The schema itself is built
    by exactly one mechanism: `alembic upgrade head`
    (`migrations/versions/0001_baseline.py` onward), see design D13."""
