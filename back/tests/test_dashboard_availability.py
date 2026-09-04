"""`occupied_nights`/`available_nights` -- owner-dashboard spec "Available
Nights Per Month" (design D8, D9 "Interfaces"). Cancelled reservations
never count as occupied; the denominator for `available_nights` excludes
inactive properties entirely.
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


def _create_reservation(owner: RegisteredOwner, property_id: str, check_in: str, check_out: str) -> dict:
    client_id = client.post(
        "/clients",
        headers=owner.headers,
        json={"full_name": "Availability Guest", "phone": _unique_phone()},
    ).json()["id"]
    response = client.post(
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
    assert response.status_code == 201
    return response.json()


def test_cancelled_reservation_nights_are_reported_as_available(
    registered_owner: RegisteredOwner,
) -> None:
    """The task list's gap: `occupied_nights` must not count a cancelled
    reservation. December 2026 has 31 nights; if the cancelled 5-night
    stay counted as occupied, available_nights would read 26 instead of 31."""
    property_id = _create_property(registered_owner, "Availability Cabin A")
    reservation = _create_reservation(
        registered_owner, property_id, "2026-12-05", "2026-12-10"
    )
    client.post(f"/reservations/{reservation['id']}/cancel", headers=registered_owner.headers)

    response = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["occupied_nights"] == 0
    assert body["available_nights"] == 31


def test_available_nights_excludes_inactive_properties_from_the_denominator(
    registered_owner: RegisteredOwner,
) -> None:
    active_property_id = _create_property(registered_owner, "Still Active Cabin")
    inactive_property_id = _create_property(registered_owner, "Retired Cabin")
    client.delete(f"/properties/{inactive_property_id}", headers=registered_owner.headers)

    response = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert response.status_code == 200
    body = response.json()
    # 31 nights * 1 active property only -- the inactive property
    # contributes zero to the denominator.
    assert body["available_nights"] == 31
    assert all(p["property_id"] != inactive_property_id for p in body["properties"])
    assert any(p["property_id"] == active_property_id for p in body["properties"])


def test_a_stay_straddling_december_and_january_splits_across_both_month_windows(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Straddling Cabin")
    _create_reservation(registered_owner, property_id, "2026-12-28", "2027-01-03")

    december = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert december.status_code == 200
    # Dec 28, 29, 30, 31 -> 4 nights inside the December window [Dec1, Jan1)
    assert december.json()["occupied_nights"] == 4

    january = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2027-01-01", "to": "2027-02-01"},
    )
    assert january.status_code == 200
    # Jan 1, 2 -> 2 nights inside the January window
    assert january.json()["occupied_nights"] == 2


def test_aggregate_reflects_combined_occupied_nights_across_properties(
    registered_owner: RegisteredOwner,
) -> None:
    property_a = _create_property(registered_owner, "Aggregate Cabin A")
    property_b = _create_property(registered_owner, "Aggregate Cabin B")
    _create_reservation(registered_owner, property_a, "2026-12-01", "2026-12-04")
    _create_reservation(registered_owner, property_b, "2026-12-10", "2026-12-16")

    response = client.get(
        "/dashboard/summary",
        headers=registered_owner.headers,
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["occupied_nights"] == 3 + 6
    assert body["available_nights"] == 2 * 31 - (3 + 6)
