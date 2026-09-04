"""`app/api/routers/properties.py` CRUD (property-management spec).

Soft delete via `deleted_at`; `is_active` is derived, never stored (design
D8). Each test uses its own freshly-registered tenant (`registered_owner`)
since these are single-tenant CRUD behaviors, not isolation tests -- see
`test_isolation_properties_clients.py` for cross-tenant assertions.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def test_create_property_is_active_by_default(registered_owner: RegisteredOwner) -> None:
    response = client.post(
        "/properties", headers=registered_owner.headers, json={"name": "Cabin 1"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Cabin 1"
    assert body["is_active"] is True
    assert "deleted_at" not in body


def test_list_properties_excludes_deleted_by_default(registered_owner: RegisteredOwner) -> None:
    headers = registered_owner.headers
    active = client.post("/properties", headers=headers, json={"name": "Active Cabin"}).json()
    inactive = client.post("/properties", headers=headers, json={"name": "Retired Cabin"}).json()
    client.delete(f"/properties/{inactive['id']}", headers=headers)

    response = client.get("/properties", headers=headers)
    assert response.status_code == 200
    ids = {p["id"] for p in response.json()}
    assert active["id"] in ids
    assert inactive["id"] not in ids


def test_list_properties_include_inactive_true_includes_deleted(
    registered_owner: RegisteredOwner,
) -> None:
    headers = registered_owner.headers
    inactive = client.post(
        "/properties", headers=headers, json={"name": "Retired Cabin Two"}
    ).json()
    client.delete(f"/properties/{inactive['id']}", headers=headers)

    response = client.get("/properties?include_inactive=true", headers=headers)
    ids = {p["id"] for p in response.json()}
    assert inactive["id"] in ids


def test_patch_property_edits_name(registered_owner: RegisteredOwner) -> None:
    headers = registered_owner.headers
    created = client.post("/properties", headers=headers, json={"name": "Old Name"}).json()

    response = client.patch(
        f"/properties/{created['id']}", headers=headers, json={"name": "New Name"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_delete_property_sets_deleted_at_without_removing_row(
    registered_owner: RegisteredOwner, migrator_engine: Engine
) -> None:
    headers = registered_owner.headers
    created = client.post("/properties", headers=headers, json={"name": "To Delete"}).json()

    response = client.delete(f"/properties/{created['id']}", headers=headers)
    assert response.status_code == 204

    get_response = client.get(f"/properties/{created['id']}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["is_active"] is False

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(registered_owner.tenant_id)},
        )
        row = conn.execute(
            text("SELECT deleted_at FROM properties WHERE id = :id"), {"id": created["id"]}
        ).one()
    assert row.deleted_at is not None
