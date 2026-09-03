"""Structural enforcement (design D7's standing rule: "never store a value
derived from other stored facts"). `total` and `completed` MUST NOT exist
as columns anywhere in the live schema -- both are computed at read time
(`app/services/reservations.py::effective_total`/`is_completed`), never
persisted. This inspects `information_schema.columns` directly, so it
would catch a regression even if every application-level test happened to
pass while someone re-added a stored column.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

_FORBIDDEN_COLUMN_NAMES = ("total", "completed", "balance")


def test_reservations_table_has_no_derived_columns(migrator_engine: Engine) -> None:
    with migrator_engine.connect() as conn:
        columns = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'reservations'"
                )
            )
        }
    present_forbidden = columns & set(_FORBIDDEN_COLUMN_NAMES)
    assert present_forbidden == set(), (
        f"reservations table must not persist derived columns, found: {present_forbidden}"
    )


def test_reservations_table_still_has_its_real_stored_columns(migrator_engine: Engine) -> None:
    """Triangulation: the check above must be driven by an actual
    information_schema query, not a query that returns an empty result no
    matter what -- confirm real stored columns ARE reported present."""
    with migrator_engine.connect() as conn:
        columns = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'reservations'"
                )
            )
        }
    assert {"price_per_night", "price_total", "check_in", "check_out", "status"} <= columns
