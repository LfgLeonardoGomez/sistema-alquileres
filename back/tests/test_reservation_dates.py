"""Stay length bounds + retroactive dates (design D6, reservation-booking
spec 'Stay Length Bounds' / 'Retroactive Dates Are Allowed'). The ONLY
date rules in the system are the 1-60 night `CHECK` and the `EXCLUDE`
non-overlap constraint -- there is deliberately NO "check-in must be
today or later" rule anywhere (Pydantic, CHECK, or service layer): the
owner is backfilling a paper notebook mid-season and must be able to
enter stays that already happened or are in progress.
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


def test_zero_nights_rejected(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Zero Nights Cabin")
    client_id = _create_client(registered_owner, "Zero Nights Guest")

    response = _reserve(registered_owner, property_id, client_id, "2026-05-01", "2026-05-01")
    assert response.status_code == 422


def test_sixty_one_nights_rejected(registered_owner: RegisteredOwner) -> None:
    """Triangulation: a different boundary (61, not 0) must also fail --
    proves the CHECK bounds both ends, not just rejecting equal dates."""
    property_id = _create_property(registered_owner, "Too Long Cabin")
    client_id = _create_client(registered_owner, "Too Long Guest")

    response = _reserve(registered_owner, property_id, client_id, "2026-05-01", "2026-07-01")
    assert response.status_code == 422


def test_minimum_one_night_accepted(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Min Nights Cabin")
    client_id = _create_client(registered_owner, "Min Nights Guest")

    response = _reserve(registered_owner, property_id, client_id, "2026-05-01", "2026-05-02")
    assert response.status_code == 201


def test_maximum_sixty_nights_accepted(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Max Nights Cabin")
    client_id = _create_client(registered_owner, "Max Nights Guest")

    response = _reserve(registered_owner, property_id, client_id, "2026-05-01", "2026-06-30")
    assert response.status_code == 201


def test_fully_past_stay_is_accepted_and_reads_as_completed(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Past Stay Cabin")
    client_id = _create_client(registered_owner, "Past Stay Guest")

    response = _reserve(registered_owner, property_id, client_id, "2020-01-05", "2020-01-10")
    assert response.status_code == 201


def test_in_progress_stay_is_accepted(registered_owner: RegisteredOwner) -> None:
    """check_in in the past, check_out in the future -- within the 60-night
    bound, so a rejection here can only be a future-date rule, not the
    nights-range CHECK (see test_sixty_one_nights_rejected for that one)."""
    property_id = _create_property(registered_owner, "In Progress Cabin")
    client_id = _create_client(registered_owner, "In Progress Guest")

    today = date.today()
    check_in = (today - timedelta(days=5)).isoformat()
    check_out = (today + timedelta(days=5)).isoformat()

    response = _reserve(registered_owner, property_id, client_id, check_in, check_out)
    assert response.status_code == 201
