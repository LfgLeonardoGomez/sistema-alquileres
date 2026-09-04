"""`app/api/routers/clients.py` + `upsert_or_reactivate_client` (design D8,
client-management spec).

`POST /clients` is itself the find-or-create-or-reactivate entrypoint: a
second create with the same phone is not a conflict, it resolves to the
SAME client id (a 200, not a fresh 201) -- see `app/services/clients.py`
for why the D8 upsert absorbs this rather than raising. The `23505`
mapping added in `app/errors.py` (task 3.12) is a backstop for a different
write path (`PATCH` changing `phone` onto an existing value), covered
below.
"""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def test_create_client_returns_201_and_active(registered_owner: RegisteredOwner) -> None:
    response = client.post(
        "/clients",
        headers=registered_owner.headers,
        json={"full_name": "Jane Doe", "phone": _unique_phone()},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Jane Doe"
    assert body["is_active"] is True


def test_second_create_with_same_phone_returns_same_id(
    registered_owner: RegisteredOwner,
) -> None:
    headers = registered_owner.headers
    phone = _unique_phone()
    first = client.post(
        "/clients", headers=headers, json={"full_name": "Jane Doe", "phone": phone}
    ).json()

    second = client.post(
        "/clients", headers=headers, json={"full_name": "Different Name", "phone": phone}
    )
    assert second.status_code == 200
    body = second.json()
    assert body["id"] == first["id"]
    # Reactivation/no-op path never overwrites the existing name (design D8).
    assert body["full_name"] == "Jane Doe"


def test_soft_delete_then_recreate_same_phone_reactivates_same_id(
    registered_owner: RegisteredOwner,
) -> None:
    headers = registered_owner.headers
    phone = _unique_phone()
    created = client.post(
        "/clients", headers=headers, json={"full_name": "Original Name", "phone": phone}
    ).json()
    delete_response = client.delete(f"/clients/{created['id']}", headers=headers)
    assert delete_response.status_code == 204

    deleted_check = client.get(f"/clients/{created['id']}", headers=headers)
    assert deleted_check.json()["is_active"] is False

    reactivated = client.post(
        "/clients", headers=headers, json={"full_name": "Attempted Rename", "phone": phone}
    )
    assert reactivated.status_code == 200
    body = reactivated.json()
    assert body["id"] == created["id"]
    assert body["is_active"] is True
    assert body["full_name"] == "Original Name"


def test_list_clients_excludes_deleted_by_default(registered_owner: RegisteredOwner) -> None:
    headers = registered_owner.headers
    active = client.post(
        "/clients", headers=headers, json={"full_name": "Active Client", "phone": _unique_phone()}
    ).json()
    inactive = client.post(
        "/clients",
        headers=headers,
        json={"full_name": "Inactive Client", "phone": _unique_phone()},
    ).json()
    client.delete(f"/clients/{inactive['id']}", headers=headers)

    response = client.get("/clients", headers=headers)
    assert response.status_code == 200
    ids = {c["id"] for c in response.json()}
    assert active["id"] in ids
    assert inactive["id"] not in ids


def test_get_client_by_id_does_not_filter_inactive(registered_owner: RegisteredOwner) -> None:
    headers = registered_owner.headers
    created = client.post(
        "/clients", headers=headers, json={"full_name": "To Delete", "phone": _unique_phone()}
    ).json()
    client.delete(f"/clients/{created['id']}", headers=headers)

    response = client.get(f"/clients/{created['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_patch_client_edits_full_name(registered_owner: RegisteredOwner) -> None:
    headers = registered_owner.headers
    created = client.post(
        "/clients", headers=headers, json={"full_name": "Old Name", "phone": _unique_phone()}
    ).json()

    response = client.patch(
        f"/clients/{created['id']}", headers=headers, json={"full_name": "New Name"}
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name"


def test_patch_client_phone_to_existing_phone_returns_409(
    registered_owner: RegisteredOwner,
) -> None:
    """The `23505` backstop (task 3.12): `PATCH` does not go through the
    D8 upsert, so a phone collision here surfaces as a plain unique
    violation, not a silent reactivation."""
    headers = registered_owner.headers
    taken_phone = _unique_phone()
    client.post(
        "/clients", headers=headers, json={"full_name": "Owns The Phone", "phone": taken_phone}
    )
    victim = client.post(
        "/clients", headers=headers, json={"full_name": "Wants The Phone", "phone": _unique_phone()}
    ).json()

    response = client.patch(
        f"/clients/{victim['id']}", headers=headers, json={"phone": taken_phone}
    )
    assert response.status_code == 409
