"""Client identity stability across soft-delete + reactivation
(client-management spec: "Reactivation preserves history").

The load-bearing guarantee this test protects is that reactivation via
`upsert_or_reactivate_client` (design D8) NEVER produces a new client id --
it always resolves the SAME row a prior reservation's `client_id` FK would
already be pointing at. That id-stability property is exactly what a
`reservations.client_id` foreign key depends on to survive a reactivation
cycle.

DEFERRED (Phase 4): the `reservations` table does not exist yet, so this
test cannot literally attach a reservation and assert its FK still points
at the reactivated client afterward. Once Phase 4 lands, extend this test
to: seed two reservations for the client, soft-delete the client, delete
its now-orphaned-from-active-listing state, reactivate via the same phone,
and assert both reservations' `client_id` still equals the original id
(task 3.13's full scope; task 5.12 re-confirms this once payments/balance
also read through the same client row).
"""

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    import uuid

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
