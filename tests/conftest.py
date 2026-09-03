"""Shared test fixtures.

The autouse session fixture resets the test database from scratch (drop,
recreate, seed) exactly once per test run, using the alquileres_migrator
role. Individual tests then read through the app-role engine, matching how
the real API connects (see design D5's structural note: tests that connect
as the migrator prove nothing about isolation).
"""

import os

import pytest
from sqlalchemy import Engine, create_engine

from app.db import bootstrap
from scripts import seed as seed_script


@pytest.fixture(scope="session", autouse=True)
def _reset_and_seed_test_database() -> None:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        bootstrap.reset_database(engine)
        seed_script.run(engine)
    finally:
        engine.dispose()


@pytest.fixture(scope="session")
def migrator_engine() -> Engine:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def app_engine() -> Engine:
    engine = create_engine(os.environ["DATABASE_URL"])
    yield engine
    engine.dispose()
