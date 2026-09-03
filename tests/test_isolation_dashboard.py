"""Cross-tenant isolation for the dashboard endpoint (tenant-isolation
spec: "Cross-Tenant Isolation Verified Per Endpoint"). Three seeded
tenants; the dashboard summary must reflect only the caller's own
tenant's payments and reservations, never another tenant's.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import SeededTenant

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _headers(owner: SeededTenant) -> dict:
    return {"Authorization": f"Bearer {owner.access_token}"}


def _create_reservation_with_payment(owner: SeededTenant) -> None:
    property_id = client.post(
        "/properties", headers=_headers(owner), json={"name": "Isolation Dashboard Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=_headers(owner),
        json={"full_name": "Isolation Dashboard Guest", "phone": _unique_phone()},
    ).json()["id"]
    reservation = client.post(
        "/reservations",
        headers=_headers(owner),
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-12-05",
            "check_out": "2026-12-10",
            "price_total": "5000.00",
        },
    ).json()
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=_headers(owner),
        json={"amount": "5000.00", "paid_on": "2026-12-06"},
    )


def test_dashboard_summary_reflects_only_the_callers_own_tenant(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, owner_c = seed_three_tenants
    _create_reservation_with_payment(owner_a)
    _create_reservation_with_payment(owner_b)
    _create_reservation_with_payment(owner_b)

    response_a = client.get(
        "/dashboard/summary",
        headers=_headers(owner_a),
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    response_c = client.get(
        "/dashboard/summary",
        headers=_headers(owner_c),
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )

    assert response_a.status_code == 200
    assert Decimal(str(response_a.json()["collected"])) == Decimal("5000.00")
    assert response_a.json()["occupied_nights"] == 5
    assert len(response_a.json()["properties"]) == 1

    assert response_c.status_code == 200
    assert Decimal(str(response_c.json()["collected"])) == Decimal("0.00")
    assert response_c.json()["occupied_nights"] == 0
    assert response_c.json()["properties"] == []
