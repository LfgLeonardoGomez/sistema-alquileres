"""`collected` -- cash-basis income aggregation (owner-dashboard spec
"collected -- Cash-Basis Income", design D7/D8). Buckets strictly by
`payments.paid_on`, never by the reservation's stay dates.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_property(owner: RegisteredOwner, name: str) -> str:
    return client.post("/properties", headers=owner.headers, json={"name": name}).json()["id"]


def _create_reservation(owner: RegisteredOwner, property_id: str, check_in: str, check_out: str) -> dict:
    client_id = client.post(
        "/clients",
        headers=owner.headers,
        json={"full_name": "Dashboard Guest", "phone": _unique_phone()},
    ).json()["id"]
    return client.post(
        "/reservations",
        headers=owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": check_in,
            "check_out": check_out,
            "price_total": "1000.00",
        },
    ).json()


def _pay(owner: RegisteredOwner, reservation_id: str, amount: str, paid_on: str) -> None:
    response = client.post(
        f"/reservations/{reservation_id}/payments",
        headers=owner.headers,
        json={"amount": amount, "paid_on": paid_on, "method": "cash"},
    )
    assert response.status_code == 201


def test_deposit_counts_in_the_month_it_was_paid_not_the_stay_month(
    registered_owner: RegisteredOwner,
) -> None:
    """A payment of 1000.00 on 2026-10-15 for a January 2027 stay must
    count in October's `collected`, not January's."""
    property_id = _create_property(registered_owner, "Collected Cabin A")
    reservation = _create_reservation(
        registered_owner, property_id, "2027-01-10", "2027-01-15"
    )
    _pay(registered_owner, reservation["id"], "1000.00", "2026-10-15")

    october = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-10-01", "to": "2026-11-01"},
    )
    assert october.status_code == 200
    assert Decimal(str(october.json()["collected"])) == Decimal("1000.00")

    january = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2027-01-01", "to": "2027-02-01"},
    )
    assert january.status_code == 200
    assert Decimal(str(january.json()["collected"])) == Decimal("0.00")


def test_a_refund_reduces_collected(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Collected Cabin B")
    reservation = _create_reservation(
        registered_owner, property_id, "2026-11-01", "2026-11-05"
    )
    _pay(registered_owner, reservation["id"], "800.00", "2026-11-02")
    _pay(registered_owner, reservation["id"], "-300.00", "2026-11-03")

    response = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-11-01", "to": "2026-12-01"},
    )
    assert response.status_code == 200
    assert Decimal(str(response.json()["collected"])) == Decimal("500.00")


def test_collected_counts_payments_on_both_active_and_inactive_properties(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Soon Retired Cabin")
    reservation = _create_reservation(
        registered_owner, property_id, "2026-10-05", "2026-10-10"
    )
    _pay(registered_owner, reservation["id"], "900.00", "2026-10-20")

    client.delete(f"/properties/{property_id}", headers=registered_owner.headers)

    response = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-10-01", "to": "2026-11-01"},
    )
    assert response.status_code == 200
    assert Decimal(str(response.json()["collected"])) == Decimal("900.00")
