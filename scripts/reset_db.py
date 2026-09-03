"""The ONE command that recreates the database from scratch: extension ->
tables -> RLS -> grants -> seed. This is the greenfield replacement for
`alembic upgrade head` while the schema still changes daily (see engram:
architecture/schema-bootstrap). It is destructive by design -- it drops and
rebuilds every table this project owns.

Usage (from the repo root, via Docker Compose):

    docker compose run --rm api python -m scripts.reset_db
"""

import os

from sqlalchemy import create_engine

from app.db import bootstrap
from scripts import seed


def main() -> None:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        bootstrap.reset_database(engine)
        seed.run(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
