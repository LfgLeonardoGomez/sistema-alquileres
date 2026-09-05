"""`GET /reservations` filters: `client_id`, the `from`/`to` half-open
overlap window, `status`, and the default ordering (design D43,
reservation-booking spec "Filters By `client_id`" / "Filters By A
Half-Open Date Window, Matched By Overlap").
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


def _list(owner: RegisteredOwner, **params):
    return client.get("/reservations", headers=owner.headers, params=params)


# --- 2.1 client_id -----------------------------------------------------


def test_filter_by_client_id_returns_only_that_clients_reservations(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Client Filter Cabin")
    client_a = _create_client(registered_owner, "Client A")
    client_b = _create_client(registered_owner, "Client B")

    reservation_a1 = _reserve(
        registered_owner, property_id, client_a, "2026-01-05", "2026-01-10"
    ).json()["id"]
    reservation_a2 = _reserve(
        registered_owner, property_id, client_a, "2026-02-05", "2026-02-10"
    ).json()["id"]
    reservation_b = _reserve(
        registered_owner, property_id, client_b, "2026-03-05", "2026-03-10"
    ).json()["id"]

    response = _list(registered_owner, client_id=client_a)
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert ids == {reservation_a1, reservation_a2}
    assert reservation_b not in ids


def test_client_reservation_on_soft_deleted_property_still_appears(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Soft Deleted Filter Cabin")
    client_id = _create_client(registered_owner, "Soft Delete Filter Guest")
    reservation_id = _reserve(
        registered_owner, property_id, client_id, "2026-04-05", "2026-04-10"
    ).json()["id"]

    delete_response = client.delete(
        f"/properties/{property_id}", headers=registered_owner.headers
    )
    assert delete_response.status_code == 204

    response = _list(registered_owner, client_id=client_id)
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert reservation_id in ids


# --- 2.3 from/to overlap -------------------------------------------------


def test_straddling_stay_is_returned_by_overlap_window(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Straddle Cabin")
    client_id = _create_client(registered_owner, "Straddle Guest")
    reservation_id = _reserve(
        registered_owner, property_id, client_id, "2026-08-28", "2026-09-03"
    ).json()["id"]

    response = _list(registered_owner, **{"from": "2026-09-01", "to": "2026-10-01"})
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert reservation_id in ids


def test_stay_entirely_outside_window_is_excluded(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Outside Window Cabin")
    client_id = _create_client(registered_owner, "Outside Window Guest")
    reservation_id = _reserve(
        registered_owner, property_id, client_id, "2026-07-01", "2026-07-05"
    ).json()["id"]

    response = _list(registered_owner, **{"from": "2026-09-01", "to": "2026-10-01"})
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert reservation_id not in ids


# --- 2.5 both-or-neither --------------------------------------------------


def test_only_from_is_rejected(registered_owner: RegisteredOwner) -> None:
    response = _list(registered_owner, **{"from": "2026-09-01"})
    assert response.status_code == 422


def test_only_to_is_rejected(registered_owner: RegisteredOwner) -> None:
    response = _list(registered_owner, **{"to": "2026-10-01"})
    assert response.status_code == 422


# --- 2.7 inverted window ---------------------------------------------------


def test_from_after_to_is_rejected(registered_owner: RegisteredOwner) -> None:
    response = _list(registered_owner, **{"from": "2026-10-01", "to": "2026-09-01"})
    assert response.status_code == 422


def test_from_equal_to_is_rejected(registered_owner: RegisteredOwner) -> None:
    """Zero-width window: `from == to` is a mistake too, not an empty list
    (design D43 -- rejected under the same rule as an inverted range)."""
    response = _list(registered_owner, **{"from": "2026-09-01", "to": "2026-09-01"})
    assert response.status_code == 422


# --- 2.9 no filters returns unfiltered list --------------------------------


def test_no_filters_returns_the_unfiltered_list(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Unfiltered Cabin")
    client_id = _create_client(registered_owner, "Unfiltered Guest")
    reservation_id = _reserve(
        registered_owner, property_id, client_id, "2026-05-05", "2026-05-10"
    ).json()["id"]

    response = _list(registered_owner)
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert reservation_id in ids


# --- 2.10 client_id AND window ---------------------------------------------


def test_client_id_combines_with_window_by_and(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Combined Filter Cabin")
    client_id = _create_client(registered_owner, "Combined Filter Guest")
    inside_id = _reserve(
        registered_owner, property_id, client_id, "2026-09-05", "2026-09-10"
    ).json()["id"]
    outside_id = _reserve(
        registered_owner, property_id, client_id, "2026-11-05", "2026-11-10"
    ).json()["id"]

    response = _list(
        registered_owner, client_id=client_id, **{"from": "2026-09-01", "to": "2026-10-01"}
    )
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert ids == {inside_id}
    assert outside_id not in ids


# --- 2.12 status filter -----------------------------------------------------


def test_status_filter_excludes_cancelled(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Status Filter Cabin")
    client_id = _create_client(registered_owner, "Status Filter Guest")
    reserved_id = _reserve(
        registered_owner, property_id, client_id, "2026-06-05", "2026-06-10"
    ).json()["id"]
    cancelled_id = _reserve(
        registered_owner, property_id, client_id, "2026-06-15", "2026-06-20"
    ).json()["id"]
    cancel_response = client.post(
        f"/reservations/{cancelled_id}/cancel", headers=registered_owner.headers
    )
    assert cancel_response.status_code == 200

    response = _list(registered_owner, status="reserved")
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert reserved_id in ids
    assert cancelled_id not in ids


def test_omitting_status_keeps_the_cancelled_inclusive_default(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Status Default Cabin")
    client_id = _create_client(registered_owner, "Status Default Guest")
    cancelled_id = _reserve(
        registered_owner, property_id, client_id, "2026-06-25", "2026-06-30"
    ).json()["id"]
    cancel_response = client.post(
        f"/reservations/{cancelled_id}/cancel", headers=registered_owner.headers
    )
    assert cancel_response.status_code == 200

    response = _list(registered_owner)
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert cancelled_id in ids


# --- 2.14 default ordering --------------------------------------------------


def test_default_ordering_is_by_check_in_then_created_at(
    registered_owner: RegisteredOwner,
) -> None:
    # Three distinct properties -- the point of this test is ordering, not
    # overlap, and same-check_in reservations on one property would
    # collide with `reservations_no_overlap`.
    property_1 = _create_property(registered_owner, "Ordering Cabin 1")
    property_2 = _create_property(registered_owner, "Ordering Cabin 2")
    property_3 = _create_property(registered_owner, "Ordering Cabin 3")
    client_id = _create_client(registered_owner, "Ordering Guest")

    # Recorded first (earlier created_at) but with a LATER check_in --
    # proves the primary sort key changed to check_in, not just a
    # secondary tie-break on created_at.
    later_check_in_id = _reserve(
        registered_owner, property_1, client_id, "2026-12-20", "2026-12-25"
    ).json()["id"]
    # Recorded second (later created_at) but with an EARLIER check_in.
    earlier_check_in_id = _reserve(
        registered_owner, property_2, client_id, "2026-12-01", "2026-12-05"
    ).json()["id"]
    # A third stay sharing the same check_in as the second one, on a
    # different property (to avoid `reservations_no_overlap`) -- a stable
    # tie-break by created_at proves created_at is still the secondary key.
    same_check_in_recorded_later_id = _reserve(
        registered_owner, property_3, client_id, "2026-12-01", "2026-12-03"
    ).json()["id"]

    response = _list(registered_owner)
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()]

    relevant = [
        i
        for i in ids
        if i in {later_check_in_id, earlier_check_in_id, same_check_in_recorded_later_id}
    ]
    assert relevant == [
        earlier_check_in_id,
        same_check_in_recorded_later_id,
        later_check_in_id,
    ]
