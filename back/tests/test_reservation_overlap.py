"""Non-overlap invariant (design D6, reservation-booking spec 'Non-Overlap
Enforced at the Database Level' / 'Nights Modeled as a Half-Open
Interval'). These tests submit real overlapping date ranges through the
HTTP API and assert the `EXCLUDE USING gist` constraint's outcome -- not a
mocked or application-level check.
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


def _reserve(owner: RegisteredOwner, property_id: str, client_id: str, check_in: str, check_out: str):
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
    )


def test_overlapping_dates_rejected(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Overlap Cabin")
    client_id = _create_client(registered_owner, "Overlap Guest")

    first = _reserve(registered_owner, property_id, client_id, "2026-12-05", "2026-12-10")
    assert first.status_code == 201

    second = _reserve(registered_owner, property_id, client_id, "2026-12-08", "2026-12-12")
    assert second.status_code == 409
    assert second.json()["code"] == "dates_unavailable"


def test_adjacent_stay_does_not_conflict(registered_owner: RegisteredOwner) -> None:
    """Triangulation (reservation-booking spec 'Adjacent stays do not
    conflict'): the half-open `'[)'` bound means checkout day == next
    check-in day is legal, not an overlap."""
    property_id = _create_property(registered_owner, "Adjacency Cabin")
    client_id = _create_client(registered_owner, "Adjacency Guest")

    first = _reserve(registered_owner, property_id, client_id, "2026-11-01", "2026-11-05")
    assert first.status_code == 201

    adjacent = _reserve(registered_owner, property_id, client_id, "2026-11-05", "2026-11-10")
    assert adjacent.status_code == 201


def test_cancel_then_rebook_same_nights_succeeds(registered_owner: RegisteredOwner) -> None:
    """Triangulation (reservation-booking spec 'Cancelling frees the
    nights'): cancelled reservations are excluded from the EXCLUDE
    predicate (`WHERE status <> 'cancelled'`), so the exact same range can
    be rebooked, and the cancelled row remains readable by its id."""
    property_id = _create_property(registered_owner, "Cancel Rebook Cabin")
    client_id = _create_client(registered_owner, "Cancel Rebook Guest")

    original = _reserve(registered_owner, property_id, client_id, "2026-10-01", "2026-10-06")
    assert original.status_code == 201
    original_id = original.json()["id"]

    cancel_response = client.post(
        f"/reservations/{original_id}/cancel", headers=registered_owner.headers
    )
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"

    rebooked = _reserve(registered_owner, property_id, client_id, "2026-10-01", "2026-10-06")
    assert rebooked.status_code == 201

    still_readable = client.get(
        f"/reservations/{original_id}", headers=registered_owner.headers
    )
    assert still_readable.status_code == 200
    assert still_readable.json()["status"] == "cancelled"
