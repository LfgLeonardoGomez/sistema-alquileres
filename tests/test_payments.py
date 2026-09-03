"""Payment CRUD (payment-tracking spec "Multiple Partial Payments
Accumulate", design D7). `POST /reservations/{id}/payments` creates a
payment row; `amount = 0` is rejected via the DB CHECK (`23514` -> 422,
`app/errors.py`, design D11) -- the same concurrency-safe backstop pattern
used everywhere else in this project, no separate Pydantic constraint.
`GET` lists every payment recorded against one reservation.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
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
        json={"amount": "2000.00"},
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
            json={"amount": "2000.00"},
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
        json={"amount": "0.00"},
    )
    assert response.status_code == 422


def test_get_lists_payments_for_a_reservation(registered_owner: RegisteredOwner) -> None:
    reservation = _create_reservation(registered_owner)
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "1000.00"},
    )
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=registered_owner.headers,
        json={"amount": "1500.00"},
    )

    response = client.get(
        f"/reservations/{reservation['id']}/payments", headers=registered_owner.headers
    )
    assert response.status_code == 200
    amounts = {Decimal(str(p["amount"])) for p in response.json()}
    assert amounts == {Decimal("1000.00"), Decimal("1500.00")}
