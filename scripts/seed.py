"""Development seed data.

Three tenants, not two: two tenants hide isolation bugs that leak in only
one direction (design Testing Strategy). Run as part of `scripts.reset_db`,
via the alquileres_migrator role.

`ON CONFLICT (slug) DO NOTHING` (design D18): `scripts/reset_db.py` no
longer drops and recreates the schema before calling this, so `run()` must
be safely re-runnable against a database that already has these three
tenants.
"""

import os

from sqlalchemy import Engine, create_engine
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.tenant import Tenant

SEED_TENANTS = [
    {"name": "Mar del Tuyu Cabins", "slug": "mar-del-tuyu-cabins"},
    {"name": "Bariloche Lake Houses", "slug": "bariloche-lake-houses"},
    {"name": "Villa Carlos Paz Retreat", "slug": "villa-carlos-paz-retreat"},
]


def run(engine: Engine) -> None:
    with engine.begin() as conn:
        for data in SEED_TENANTS:
            stmt = (
                pg_insert(Tenant.__table__)
                .values(**data)
                .on_conflict_do_nothing(index_elements=["slug"])
            )
            conn.execute(stmt)


def main() -> None:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        run(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
