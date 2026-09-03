"""Development seed data.

Three tenants, not two: two tenants hide isolation bugs that leak in only
one direction (design Testing Strategy). Run as part of `scripts.reset_db`,
via the alquileres_migrator role.
"""

import os

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.models.tenant import Tenant

SEED_TENANTS = [
    {"name": "Mar del Tuyu Cabins", "slug": "mar-del-tuyu-cabins"},
    {"name": "Bariloche Lake Houses", "slug": "bariloche-lake-houses"},
    {"name": "Villa Carlos Paz Retreat", "slug": "villa-carlos-paz-retreat"},
]


def run(engine: Engine) -> None:
    with Session(engine) as session:
        for data in SEED_TENANTS:
            session.add(Tenant(**data))
        session.commit()


def main() -> None:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        run(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
