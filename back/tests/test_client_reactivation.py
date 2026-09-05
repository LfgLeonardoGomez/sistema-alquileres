"""Client identity stability across soft-delete + reactivation
(client-management spec: "Reactivation preserves history").

The load-bearing guarantee this test protects is that reactivation via
`upsert_or_reactivate_client` (design D8) NEVER produces a new client id --
it always resolves the SAME row a prior reservation's `client_id` FK would
already be pointing at. That id-stability property is exactly what a
`reservations.client_id` foreign key depends on to survive a reactivation
cycle.

Task 5.12: the Phase 3 deferred assertion (task 3.13) is now exercised for
real -- `reservations` and `payments` both exist as of Phase 4/5, so
`test_reservations_and_their_payments_survive_client_reactivation` below
seeds real reservations (with a payment) for a client, soft-deletes and
reactivates it, and asserts every reservation's `client_id` -- and its
payments, reached only through the reservation -- are still readable
under the SAME client id afterward.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def test_reactivation_preserves_the_same_client_id(registered_owner: RegisteredOwner) -> None:
    headers = registered_owner.headers
    phone = _unique_phone()

    created = client.post(
        "/clients", headers=headers, json={"full_name": "Repeat Guest", "phone": phone}
    ).json()
    original_id = created["id"]

    delete_response = client.delete(f"/clients/{original_id}", headers=headers)
    assert delete_response.status_code == 204

    reactivated = client.post(
        "/clients", headers=headers, json={"full_name": "Repeat Guest", "phone": phone}
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["id"] == original_id
    assert reactivated.json()["is_active"] is True


def test_reactivation_survives_a_second_delete_reactivate_cycle(
    registered_owner: RegisteredOwner,
) -> None:
    """Triangulation: the id must stay stable across MULTIPLE
    delete/reactivate cycles, not just one -- a bug that only preserved
    identity on the first cycle would still break a client with a longer
    history."""
    headers = registered_owner.headers
    phone = _unique_phone()

    created = client.post(
        "/clients", headers=headers, json={"full_name": "Frequent Guest", "phone": phone}
    ).json()
    original_id = created["id"]

    for _ in range(2):
        delete_response = client.delete(f"/clients/{original_id}", headers=headers)
        assert delete_response.status_code == 204
        reactivated = client.post(
            "/clients", headers=headers, json={"full_name": "Frequent Guest", "phone": phone}
        )
        assert reactivated.status_code == 200
        assert reactivated.json()["id"] == original_id


def test_reservations_and_their_payments_survive_client_reactivation(
    registered_owner: RegisteredOwner,
) -> None:
    """The task 3.13 assertion, made real (task 5.12): a client's prior
    reservations -- and their payments, which are reached only through the
    reservation, never a direct client FK (payment-tracking spec "Payment
    Record": "A payment row MUST NOT carry a client_id") -- remain
    attached to the SAME client id after a soft-delete/reactivate cycle."""
    headers = registered_owner.headers
    phone = _unique_phone()

    guest = client.post(
        "/clients", headers=headers, json={"full_name": "History Guest", "phone": phone}
    ).json()
    original_client_id = guest["id"]

    property_id = client.post(
        "/properties", headers=headers, json={"name": "History Cabin"}
    ).json()["id"]

    reservation = client.post(
        "/reservations",
        headers=headers,
        json={
            "property_id": property_id,
            "client_id": original_client_id,
            "check_in": "2026-09-01",
            "check_out": "2026-09-06",
            "price_total": "5000.00",
        },
    ).json()
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=headers,
        json={"amount": "2000.00", "method": "cash"},
    )

    delete_response = client.delete(f"/clients/{original_client_id}", headers=headers)
    assert delete_response.status_code == 204

    reactivated = client.post(
        "/clients", headers=headers, json={"full_name": "History Guest", "phone": phone}
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["id"] == original_client_id

    # The reservation itself: readable, still pointing at the SAME client id.
    reservation_after = client.get(f"/reservations/{reservation['id']}", headers=headers)
    assert reservation_after.status_code == 200
    assert reservation_after.json()["client_id"] == original_client_id

    # Its payments: still readable through the reservation, unaffected by
    # the client's delete/reactivate cycle (they never referenced the
    # client directly in the first place).
    payments_after = client.get(
        f"/reservations/{reservation['id']}/payments", headers=headers
    )
    assert payments_after.status_code == 200
    assert Decimal(str(payments_after.json()[0]["amount"])) == Decimal("2000.00")
