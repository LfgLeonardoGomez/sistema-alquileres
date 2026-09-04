"""Refunds (payment-tracking spec "Manual Refund Entries", design D7).
Refunds are ordinary `payments` rows with a negative `amount` -- there is
NO separate `kind`/`type` discriminator column anywhere in the schema; the
sign of `amount` is the only thing that distinguishes a refund from a
payment. Cancellation itself never creates a payment row automatically
(spec scenario "Cancellation does not create a refund automatically") --
a refund is always a deliberate, separate `POST`.
"""

from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    import uuid

    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_reservation(owner: RegisteredOwner) -> dict:
    property_id = client.post(
        "/properties", headers=owner.headers, json={"name": "Refund Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=owner.headers,
        json={"full_name": "Refund Guest", "phone": _unique_phone()},
    ).json()["id"]
    return client.post(
        "/reservations",
        headers=owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-07-01",
            "check_out": "2026-07-06",
            "price_total": "5000.00",
        },
    ).json()


def test_a_negative_amount_payment_records_as_a_refund(
    registered_owner: RegisteredOwner,
) -> None:
    reservation = _create_reservation(registered_owner)
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00"},
    )

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "-2000.00", "note": "Guest cancelled, full refund"},
    )
    assert response.status_code == 201
    assert Decimal(str(response.json()["amount"])) == Decimal("-2000.00")


def test_refund_increases_balance_less_paid(registered_owner: RegisteredOwner) -> None:
    """Triangulation: a partial refund (not a full one) must still move
    the balance by exactly the refunded amount -- a bug that only handled
    the full-refund case would still pass the test above."""
    reservation = _create_reservation(registered_owner)
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "3000.00"},
    )
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "-1000.00"},
    )

    read = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert Decimal(str(read.json()["paid_amount"])) == Decimal("2000.00")
    assert Decimal(str(read.json()["balance"])) == Decimal("3000.00")


def test_cancellation_does_not_create_a_refund_automatically(
    registered_owner: RegisteredOwner,
) -> None:
    reservation = _create_reservation(registered_owner)
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "2000.00"},
    )

    cancel = client.post(
        f"/reservations/{reservation['id']}/cancel", headers=registered_owner.headers
    )
    assert cancel.status_code == 200

    payments = client.get(
        f"/reservations/{reservation['id']}/payments", headers=registered_owner.headers
    )
    assert len(payments.json()) == 1  # only the original deposit, no auto-refund row


def test_payments_schema_has_no_kind_or_type_discriminator_column(
    migrator_engine: Engine,
) -> None:
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
    assert "kind" not in columns
    assert "type" not in columns
