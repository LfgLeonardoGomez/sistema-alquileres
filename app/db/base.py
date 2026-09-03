from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base. Every ORM model registers its table here,
    and `Base.metadata` is what the bootstrap script uses as the schema's
    source of truth (see app.db.bootstrap)."""
