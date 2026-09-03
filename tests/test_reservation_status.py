"""Two persisted states, `completed` derived (design D7, reservation-
booking spec 'Two Persisted States, `completed` Derived'). `completed`
MUST NOT be a stored column -- it is computed at read time as
`status == 'reserved' AND check_out < today` in the fixed
`America/Argentina/Buenos_Aires` timezone.
"""

import uuid
from datetime import date, timedelta

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


def test_cancel_sets_status_cancelled(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Cancel Status Cabin")
    client_id = _create_client(registered_owner, "Cancel Status Guest")

    today = date.today()
    check_in = (today + timedelta(days=10)).isoformat()
    check_out = (today + timedelta(days=15)).isoformat()
    created = _reserve(registered_owner, property_id, client_id, check_in, check_out).json()

    response = client.post(
        f"/reservations/{created['id']}/cancel", headers=registered_owner.headers
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_past_stay_reads_as_completed(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Completed Status Cabin")
    client_id = _create_client(registered_owner, "Completed Status Guest")

    created = _reserve(
        registered_owner, property_id, client_id, "2020-01-05", "2020-01-10"
    ).json()

    assert created["status"] == "reserved"
    assert created["is_completed"] is True


def test_future_stay_does_not_read_as_completed(registered_owner: RegisteredOwner) -> None:
    """Triangulation: a reservation with `check_out` in the future must
    report `is_completed = False`, proving the derivation compares against
    a real boundary and does not just always return True."""
    property_id = _create_property(registered_owner, "Not Completed Cabin")
    client_id = _create_client(registered_owner, "Not Completed Guest")

    today = date.today()
    check_in = (today + timedelta(days=30)).isoformat()
    check_out = (today + timedelta(days=35)).isoformat()
    created = _reserve(registered_owner, property_id, client_id, check_in, check_out).json()

    assert created["is_completed"] is False


def test_cancelled_reservation_is_never_completed_even_if_dates_are_past(
    registered_owner: RegisteredOwner,
) -> None:
    """Second triangulation axis: `is_completed` requires status ==
    'reserved' too, not just a past check_out -- a cancelled reservation
    with fully past dates must still read as NOT completed."""
    property_id = _create_property(registered_owner, "Cancelled Past Cabin")
    client_id = _create_client(registered_owner, "Cancelled Past Guest")

    created = _reserve(
        registered_owner, property_id, client_id, "2020-02-05", "2020-02-10"
    ).json()

    cancelled = client.post(
        f"/reservations/{created['id']}/cancel", headers=registered_owner.headers
    ).json()

    assert cancelled["status"] == "cancelled"
    assert cancelled["is_completed"] is False
