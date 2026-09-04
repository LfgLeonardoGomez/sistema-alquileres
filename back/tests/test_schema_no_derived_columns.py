"""Structural enforcement (design D7's standing rule: "never store a value
derived from other stored facts"). `total` and `completed` MUST NOT exist
as columns anywhere in the live schema -- both are computed at read time
(`app/services/reservations.py::effective_total`/`is_completed`), never
persisted. This inspects `information_schema.columns` directly, so it
would catch a regression even if every application-level test happened to
pass while someone re-added a stored column.

Task 5.11 extends this file: `balance` (payment-tracking spec "Balance Is
Derived, Never Stored") MUST NOT exist as a column on EITHER
`reservations` or `payments` -- it is a Pydantic `computed_field`
(`app/schemas/reservation.py`) over `effective_total` and the
`paid_amount` `column_property`, never a stored value on either table.
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


def test_payments_table_has_no_derived_columns(migrator_engine: Engine) -> None:
    with migrator_engine.connect() as conn:
        columns = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'payments'"
                )
            )
        }
    present_forbidden = columns & set(_FORBIDDEN_COLUMN_NAMES)
    assert present_forbidden == set(), (
        f"payments table must not persist derived columns, found: {present_forbidden}"
    )


def test_payments_table_still_has_its_real_stored_columns(migrator_engine: Engine) -> None:
    """Triangulation, mirroring the reservations check above: confirm the
    query is actually reporting real columns, not vacuously passing."""
    with migrator_engine.connect() as conn:
        columns = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'payments'"
                )
            )
        }
    assert {"amount", "paid_on", "reservation_id", "tenant_id"} <= columns


def test_payments_paid_on_has_no_database_default(migrator_engine: Engine) -> None:
    """`paid_on` must default in Python (`default=today_ar`), never in the
    database.

    The comment in `app/models/payment.py` explains why; this test is what
    actually enforces it. Postgres runs in UTC, so a `server_default` of
    `CURRENT_DATE` would stamp a payment entered at 21:00 Buenos Aires time
    on the 3rd as the 4th. Nothing would fail -- the date is valid and the
    payment is recorded -- but Phase 6's `collected` metric buckets by
    `paid_on`, so every payment entered after 21:00 ART on the last day of
    a month would silently land in the next month's total.

    A three-hour offset is enough to turn a monthly report into a lie, and
    the failure is invisible without a test that looks at the catalog.
    """
    with migrator_engine.connect() as conn:
        paid_on_default = conn.execute(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'payments' "
                "AND column_name = 'paid_on'"
            )
        ).scalar_one()

    assert paid_on_default is None, (
        "payments.paid_on must have no database default -- found "
        f"{paid_on_default!r}. Use the Python-side default=today_ar instead, "
        "or late-evening Buenos Aires payments land on the wrong calendar day."
    )


def test_payments_created_at_does_have_a_database_default(
    migrator_engine: Engine,
) -> None:
    """Triangulation: prove the query above can actually observe a default,
    so the `paid_on` assertion is not passing vacuously against a typo in
    the table or column name."""
    with migrator_engine.connect() as conn:
        created_at_default = conn.execute(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'payments' "
                "AND column_name = 'created_at'"
            )
        ).scalar_one()

    assert created_at_default is not None
