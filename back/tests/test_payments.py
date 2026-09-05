"""Payment CRUD (payment-tracking spec "Multiple Partial Payments
Accumulate", design D7). `POST /reservations/{id}/payments` creates a
payment row; `amount = 0` is rejected via the DB CHECK (`23514` -> 422,
`app/errors.py`, design D11) -- the same concurrency-safe backstop pattern
used everywhere else in this project, no separate Pydantic constraint.
`GET` lists every payment recorded against one reservation.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.models.payment import Payment
from app.services.payments import assign_purposes
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_reservation(owner: RegisteredOwner) -> dict:
    property_id = client.post(
        "/properties", headers=owner.headers, json={"name": "Payments Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=owner.headers,
        json={"full_name": "Payments Guest", "phone": _unique_phone()},
    ).json()["id"]
    return client.post(
        "/reservations",
        headers=owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-06-01",
            "check_out": "2026-06-06",
            "price_total": "6000.00",
        },
    ).json()


def test_post_payment_creates_a_partial_payment(registered_owner: RegisteredOwner) -> None:
    reservation = _create_reservation(registered_owner)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00", "method": "cash"},
    )
    assert response.status_code == 201
    body = response.json()
    assert Decimal(str(body["amount"])) == Decimal("2000.00")
    assert body["reservation_id"] == reservation["id"]


def test_multiple_partial_payments_accumulate(registered_owner: RegisteredOwner) -> None:
    """Triangulation: recording three separate partial payments must sum
    to the total paid, matching the payment-tracking spec scenario
    exactly (`3 x 2000.00 == 6000.00` on a `total = 6000.00` reservation)."""
    reservation = _create_reservation(registered_owner)

    for _ in range(3):
        response = client.post(
            f"/reservations/{reservation['id']}/payments",
            headers=registered_owner.headers,
            json={"amount": "2000.00", "method": "cash"},
        )
        assert response.status_code == 201

    read = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert Decimal(str(read.json()["paid_amount"])) == Decimal("6000.00")
    assert Decimal(str(read.json()["balance"])) == Decimal("0.00")


def test_zero_amount_payment_is_rejected(registered_owner: RegisteredOwner) -> None:
    reservation = _create_reservation(registered_owner)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "0.00", "method": "cash"},
    )
    assert response.status_code == 422


def test_get_lists_payments_for_a_reservation(registered_owner: RegisteredOwner) -> None:
    reservation = _create_reservation(registered_owner)
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "1000.00", "method": "cash"},
    )
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "1500.00", "method": "cash"},
    )

    response = client.get(
        f"/reservations/{reservation['id']}/payments", headers=registered_owner.headers
    )
    assert response.status_code == 200
    amounts = {Decimal(str(p["amount"])) for p in response.json()}
    assert amounts == {Decimal("1000.00"), Decimal("1500.00")}


# ---- task 5.2 [RED]: payment_method, written before any of 5.3's
# production code exists (payment-tracking spec "Payment Method Is A
# Stored Enum") ----


def test_payment_without_method_is_rejected(registered_owner: RegisteredOwner) -> None:
    reservation = _create_reservation(registered_owner)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00"},
    )
    assert response.status_code == 422


def test_payment_with_unrecognized_method_is_rejected(registered_owner: RegisteredOwner) -> None:
    reservation = _create_reservation(registered_owner)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00", "method": "card"},
    )
    assert response.status_code == 422


def test_payment_with_transfer_method_is_accepted_and_reported_on_read(
    registered_owner: RegisteredOwner,
) -> None:
    reservation = _create_reservation(registered_owner)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00", "method": "transfer"},
    )
    assert response.status_code == 201
    assert response.json().get("method") == "transfer"


# ---- task 5.5 [TEST]: the concurrency-safe backstop, proven independently
# of the Pydantic 422 path above (design D11). Labelled [TEST], not [RED]:
# `payments_method_valid` lands with 5.3(a), so this passes the moment it
# is written and can never have had a red phase. Connects as
# `alquileres_app`, never `alquileres_migrator` -- the migrator's writes to
# `payments` are still subject to the table's policy (`payments` is
# `FORCE ROW LEVEL SECURITY`, unlike `tenants`), but the point of this test
# is proving the app role's own path hits the CHECK, not the migrator's. ----


def test_direct_insert_with_invalid_method_raises_23514(
    registered_owner: RegisteredOwner, app_engine: Engine
) -> None:
    reservation = _create_reservation(registered_owner)

    with pytest.raises(IntegrityError) as exc_info:
        with app_engine.begin() as conn:
            conn.execute(
                text("SELECT set_config('app.tenant_id', :tid, true)"),
                {"tid": str(registered_owner.tenant_id)},
            )
            conn.execute(
                text(
                    "INSERT INTO payments "
                    "(id, tenant_id, reservation_id, amount, paid_on, payment_method) "
                    "VALUES (:id, :tid, :rid, :amount, :paid_on, :payment_method)"
                ),
                {
                    "id": uuid.uuid4(),
                    "tid": registered_owner.tenant_id,
                    "rid": reservation["id"],
                    "amount": "1000.00",
                    "paid_on": "2026-09-05",
                    "payment_method": "cheque",
                },
            )

    assert exc_info.value.orig.sqlstate == "23514"


# ---- task 5.6 [RED]: `assign_purposes()`, a pure no-DB unit test written
# before the function exists (design D42, payment-tracking spec "Payment
# Purpose Is Derived From `paid_on`, Never Stored"). `Payment` instances
# are constructed in memory only -- never added to a session, never
# flushed -- so this exercises the ordering/labeling logic with zero
# database dependency. ----


def _payment(
    *,
    amount: str,
    paid_on: date,
    created_at: datetime,
    payment_id: uuid.UUID | None = None,
) -> Payment:
    return Payment(
        id=payment_id or uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        reservation_id=uuid.uuid4(),
        amount=Decimal(amount),
        paid_on=paid_on,
        payment_method="cash",
        created_at=created_at,
    )


def test_assign_purposes_labels_earliest_positive_paid_on_as_deposit() -> None:
    """The earliest positive `paid_on` is the deposit, every other
    positive payment is a plain payment -- keyed on `paid_on`, not on the
    order the payments are passed in."""
    earliest = _payment(
        amount="1000.00",
        paid_on=date(2026, 1, 5),
        created_at=datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc),
    )
    middle = _payment(
        amount="700.00",
        paid_on=date(2026, 2, 10),
        created_at=datetime(2026, 2, 10, 10, 0, tzinfo=timezone.utc),
    )
    latest = _payment(
        amount="500.00",
        paid_on=date(2026, 3, 2),
        created_at=datetime(2026, 3, 2, 10, 0, tzinfo=timezone.utc),
    )

    purposes = assign_purposes([latest, earliest, middle])

    assert purposes[earliest.id] == "deposit"
    assert purposes[middle.id] == "payment"
    assert purposes[latest.id] == "payment"


def test_assign_purposes_labels_negative_amount_as_refund_even_if_earliest() -> None:
    """A refund is never a deposit candidate, even when its `paid_on` is
    chronologically earlier than every positive payment."""
    refund = _payment(
        amount="-200.00",
        paid_on=date(2026, 1, 1),
        created_at=datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
    )
    deposit = _payment(
        amount="1000.00",
        paid_on=date(2026, 1, 5),
        created_at=datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc),
    )

    purposes = assign_purposes([refund, deposit])

    assert purposes[refund.id] == "refund"
    assert purposes[deposit.id] == "deposit"


def test_assign_purposes_ties_on_same_paid_on_break_by_created_at_and_stay_stable() -> None:
    """Two positive payments sharing a `paid_on` break the tie by
    `created_at`; the result must not change between calls, regardless of
    the order the payments are passed in."""
    same_day = date(2026, 4, 1)
    first_by_created_at = _payment(
        amount="1000.00",
        paid_on=same_day,
        created_at=datetime(2026, 4, 1, 8, 0, tzinfo=timezone.utc),
    )
    second_by_created_at = _payment(
        amount="1000.00",
        paid_on=same_day,
        created_at=datetime(2026, 4, 1, 9, 0, tzinfo=timezone.utc),
    )

    first_result = assign_purposes([second_by_created_at, first_by_created_at])
    second_result = assign_purposes([first_by_created_at, second_by_created_at])

    assert first_result[first_by_created_at.id] == "deposit"
    assert first_result[second_by_created_at.id] == "payment"
    assert first_result == second_result


def test_assign_purposes_full_tie_breaks_by_id_and_stays_stable() -> None:
    """When `paid_on` AND `created_at` are both identical, the final,
    arbitrary-but-stable tie-break is `id` -- the label must not flip
    depending on the order the payments are passed in."""
    same_day = date(2026, 5, 1)
    same_created_at = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    lower_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    higher_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    payment_a = _payment(
        amount="1000.00", paid_on=same_day, created_at=same_created_at, payment_id=lower_id
    )
    payment_b = _payment(
        amount="1000.00", paid_on=same_day, created_at=same_created_at, payment_id=higher_id
    )

    result_ab = assign_purposes([payment_a, payment_b])
    result_ba = assign_purposes([payment_b, payment_a])

    assert result_ab[lower_id] == "deposit"
    assert result_ab[higher_id] == "payment"
    assert result_ab == result_ba


# ---- task 5.8 [RED]: integration -- `purpose` on `GET /reservations/{id}/payments`
# is derived from `paid_on`, never insertion order (payment-tracking spec
# "Payment Purpose Is Derived From `paid_on`, Never Stored") ----


def test_payments_list_labels_purpose_by_paid_on_not_recording_order(
    registered_owner: RegisteredOwner,
) -> None:
    """A payment dated 2026-03-02 is recorded FIRST, one dated 2026-01-05
    is recorded SECOND -- the list must still present the January payment
    as the deposit, because purpose follows `paid_on`, never insertion
    order."""
    reservation = _create_reservation(registered_owner)

    recorded_first = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "500.00", "method": "cash", "paid_on": "2026-03-02"},
    ).json()
    recorded_second = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "1000.00", "method": "transfer", "paid_on": "2026-01-05"},
    ).json()

    response = client.get(
        f"/reservations/{reservation['id']}/payments", headers=registered_owner.headers
    )
    by_id = {p["id"]: p for p in response.json()}

    assert by_id[recorded_second["id"]].get("purpose") == "deposit"
    assert by_id[recorded_first["id"]].get("purpose") == "payment"


def test_payments_list_labels_refund_as_neither_deposit_nor_payment(
    registered_owner: RegisteredOwner,
) -> None:
    reservation = _create_reservation(registered_owner)

    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00", "method": "cash", "paid_on": "2026-01-10"},
    )
    refund = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "-500.00", "method": "cash", "paid_on": "2026-01-15"},
    ).json()

    response = client.get(
        f"/reservations/{reservation['id']}/payments", headers=registered_owner.headers
    )
    by_id = {p["id"]: p for p in response.json()}

    refund_purpose = by_id[refund["id"]].get("purpose")
    assert refund_purpose not in ("deposit", "payment")
    assert refund_purpose == "refund"
