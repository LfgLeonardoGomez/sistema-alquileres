"""Inactive properties must never appear on the public calendar, even
though their existing reservations remain fully visible on the
authenticated side (design D9, D8; public-availability-calendar spec
"Inactive Properties Are Excluded").
"""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def test_inactive_property_absent_from_public_but_visible_authenticated(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = client.post(
        "/properties", headers=registered_owner.headers, json={"name": "Retiring Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=registered_owner.headers,
        json={"full_name": "Retiring Cabin Guest", "phone": f"+549{uuid.uuid4().int % 10**10:010d}"},
    ).json()["id"]
    reservation = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-12-05",
            "check_out": "2026-12-10",
            "price_total": "1000.00",
        },
    ).json()

    client.delete(f"/properties/{property_id}", headers=registered_owner.headers)

    public_response = client.get(
        f"/public/{registered_owner.tenant_slug}/availability",
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert public_response.status_code == 200
    assert all(p["property_id"] != property_id for p in public_response.json())

    authenticated_response = client.get(
        f"/reservations/{reservation['id']}", headers=registered_owner.headers
    )
    assert authenticated_response.status_code == 200
    assert authenticated_response.json()["id"] == reservation["id"]
