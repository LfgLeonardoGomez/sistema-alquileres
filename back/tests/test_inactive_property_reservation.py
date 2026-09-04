"""Inactive property behavior matrix (design D8): creating a NEW
reservation on a soft-deleted property is rejected (422) -- this is the
ONE application-enforced invariant in the whole design (not a DB
constraint). Existing reservations on a property that is later retired
must remain readable and editable.
"""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_property(owner: RegisteredOwner, name: str) -> str:
    return client.post("/properties", headers=owner.headers, json={"name": name}).json()["id"]


def _create_client(owner: RegisteredOwner, full_name: str) -> str:
    return client.post(
        "/clients", headers=owner.headers, json={"full_name": full_name, "phone": _unique_phone()}
    ).json()["id"]


def test_new_reservation_on_inactive_property_is_rejected(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Retiring Cabin")
    client_id = _create_client(registered_owner, "Retiring Cabin Guest")

    delete_response = client.delete(
        f"/properties/{property_id}", headers=registered_owner.headers
    )
    assert delete_response.status_code == 204

    response = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-08-01",
            "check_out": "2026-08-05",
            "price_total": "1000.00",
        },
    )
    assert response.status_code == 422


def test_existing_reservation_on_a_property_retired_afterward_stays_editable(
    registered_owner: RegisteredOwner,
) -> None:
    """Triangulation: the rule blocks NEW reservations only -- a
    reservation created while the property was active must remain
    readable AND editable after the property is later soft-deleted."""
    property_id = _create_property(registered_owner, "Later Retired Cabin")
    client_id = _create_client(registered_owner, "Later Retired Guest")

    created = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-09-01",
            "check_out": "2026-09-05",
            "price_total": "1000.00",
        },
    ).json()

    delete_response = client.delete(
        f"/properties/{property_id}", headers=registered_owner.headers
    )
    assert delete_response.status_code == 204

    read_response = client.get(
        f"/reservations/{created['id']}", headers=registered_owner.headers
    )
    assert read_response.status_code == 200

    edit_response = client.patch(
        f"/reservations/{created['id']}",
        headers=registered_owner.headers,
        json={"check_out": "2026-09-06"},
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["check_out"] == "2026-09-06"
