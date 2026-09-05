"""Client historical lookup (client-management spec, "Active Filter on
Search, Not on Historical Reads" delta, task 1.1).

Confirms, rather than implements, a mechanism the code already has:
`GET /clients/{id}` does not filter by `deleted_at`
(`app/api/routers/clients.py:58-63`), so a soft-deleted client referenced
by a past reservation still resolves in full through a direct lookup.
The reservation response itself carries only `client_id` -- never the
client's name or contact fields -- so a reader resolves those through
this endpoint, never through the reservation.

No application code changes for this task: the router already implements
the second (correct) reading of the previously-ambiguous spec wording
(design D47's closing paragraph).
"""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def test_soft_deleted_client_still_resolves_through_a_reservation(
    registered_owner: RegisteredOwner,
) -> None:
    headers = registered_owner.headers

    property_id = client.post(
        "/properties", headers=headers, json={"name": "Historical Cabin"}
    ).json()["id"]
    created_client = client.post(
        "/clients",
        headers=headers,
        json={
            "full_name": "Historical Guest",
            "phone": _unique_phone(),
            "email": "historical-guest@example.com",
            "national_id": "12345678",
        },
    ).json()
    client_id = created_client["id"]

    reservation = client.post(
        "/reservations",
        headers=headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-04-01",
            "check_out": "2026-04-05",
            "price_total": "1000.00",
        },
    ).json()

    # Soft-delete the client after the reservation exists.
    delete_response = client.delete(f"/clients/{client_id}", headers=headers)
    assert delete_response.status_code == 204

    # The reservation response carries only client_id -- no name/contact
    # fields leak into it.
    reservation_response = client.get(
        f"/reservations/{reservation['id']}", headers=headers
    )
    assert reservation_response.status_code == 200
    reservation_body = reservation_response.json()
    assert reservation_body["client_id"] == client_id
    for leaked_field in ("full_name", "phone", "email", "national_id"):
        assert leaked_field not in reservation_body

    # A direct GET /clients/{id} still resolves the inactive client in full.
    client_response = client.get(f"/clients/{client_id}", headers=headers)
    assert client_response.status_code == 200
    client_body = client_response.json()
    assert client_body["full_name"] == "Historical Guest"
    assert client_body["phone"] == created_client["phone"]
    assert client_body["email"] == "historical-guest@example.com"
    assert client_body["national_id"] == "12345678"
    assert client_body["is_active"] is False


def test_soft_deleted_client_is_excluded_from_the_list(
    registered_owner: RegisteredOwner,
) -> None:
    headers = registered_owner.headers
    client_id = client.post(
        "/clients",
        headers=headers,
        json={"full_name": "Soon Inactive", "phone": _unique_phone()},
    ).json()["id"]

    client.delete(f"/clients/{client_id}", headers=headers)

    listing = client.get("/clients", headers=headers).json()
    assert client_id not in {c["id"] for c in listing}
