"""Cross-tenant isolation for properties and clients (tenant-isolation
spec: "Cross-Tenant Isolation Verified Per Endpoint"). Three seeded
tenants, one test per endpoint per resource -- reading, mutating, or
listing another tenant's row must behave exactly as if it did not exist.
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.main import app
from tests.conftest import SeededTenant

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_property(owner: SeededTenant, name: str) -> dict:
    return client.post(
        "/properties",
        headers={"Authorization": f"Bearer {owner.access_token}"},
        json={"name": name},
    ).json()


def _create_client(owner: SeededTenant, full_name: str) -> dict:
    return client.post(
        "/clients",
        headers={"Authorization": f"Bearer {owner.access_token}"},
        json={"full_name": full_name, "phone": _unique_phone()},
    ).json()


# ---- properties -------------------------------------------------------


def test_property_get_cross_tenant_returns_404(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    prop = _create_property(owner_a, "Tenant A Cabin")

    response = client.get(
        f"/properties/{prop['id']}", headers={"Authorization": f"Bearer {owner_b.access_token}"}
    )
    assert response.status_code == 404


def test_property_patch_cross_tenant_returns_404_and_leaves_row_unchanged(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    prop = _create_property(owner_a, "Original Name")

    response = client.patch(
        f"/properties/{prop['id']}",
        headers={"Authorization": f"Bearer {owner_b.access_token}"},
        json={"name": "Hijacked Name"},
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        row = conn.execute(
            text("SELECT name FROM properties WHERE id = :id"), {"id": prop["id"]}
        ).one()
    assert row.name == "Original Name"


def test_property_delete_cross_tenant_returns_404_and_leaves_row_active(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    prop = _create_property(owner_a, "Should Survive")

    response = client.delete(
        f"/properties/{prop['id']}", headers={"Authorization": f"Bearer {owner_b.access_token}"}
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        row = conn.execute(
            text("SELECT deleted_at FROM properties WHERE id = :id"), {"id": prop["id"]}
        ).one()
    assert row.deleted_at is None


def test_property_list_excludes_other_tenants(seed_three_tenants: list[SeededTenant]) -> None:
    owner_a, owner_b, owner_c = seed_three_tenants
    prop_a = _create_property(owner_a, "Tenant A Only")
    _create_property(owner_b, "Tenant B Only")

    response = client.get(
        "/properties", headers={"Authorization": f"Bearer {owner_c.access_token}"}
    )
    assert response.status_code == 200
    ids = {p["id"] for p in response.json()}
    assert prop_a["id"] not in ids


def test_property_create_is_scoped_to_authenticated_tenant(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    created = _create_property(owner_a, "Belongs To A")

    response = client.get(
        "/properties", headers={"Authorization": f"Bearer {owner_b.access_token}"}
    )
    ids = {p["id"] for p in response.json()}
    assert created["id"] not in ids


# ---- clients ------------------------------------------------------------


def test_client_get_cross_tenant_returns_404(seed_three_tenants: list[SeededTenant]) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    guest = _create_client(owner_a, "Tenant A Guest")

    response = client.get(
        f"/clients/{guest['id']}", headers={"Authorization": f"Bearer {owner_b.access_token}"}
    )
    assert response.status_code == 404


def test_client_patch_cross_tenant_returns_404_and_leaves_row_unchanged(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    guest = _create_client(owner_a, "Original Name")

    response = client.patch(
        f"/clients/{guest['id']}",
        headers={"Authorization": f"Bearer {owner_b.access_token}"},
        json={"full_name": "Hijacked Name"},
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        row = conn.execute(
            text("SELECT full_name FROM clients WHERE id = :id"), {"id": guest["id"]}
        ).one()
    assert row.full_name == "Original Name"


def test_client_delete_cross_tenant_returns_404_and_leaves_row_active(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    guest = _create_client(owner_a, "Should Survive")

    response = client.delete(
        f"/clients/{guest['id']}", headers={"Authorization": f"Bearer {owner_b.access_token}"}
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        row = conn.execute(
            text("SELECT deleted_at FROM clients WHERE id = :id"), {"id": guest["id"]}
        ).one()
    assert row.deleted_at is None


def test_client_list_excludes_other_tenants(seed_three_tenants: list[SeededTenant]) -> None:
    owner_a, owner_b, owner_c = seed_three_tenants
    guest_a = _create_client(owner_a, "Tenant A Only Guest")
    _create_client(owner_b, "Tenant B Only Guest")

    response = client.get("/clients", headers={"Authorization": f"Bearer {owner_c.access_token}"})
    assert response.status_code == 200
    ids = {c["id"] for c in response.json()}
    assert guest_a["id"] not in ids


def test_client_create_is_scoped_to_authenticated_tenant(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    created = _create_client(owner_a, "Belongs To A")

    response = client.get("/clients", headers={"Authorization": f"Bearer {owner_b.access_token}"})
    ids = {c["id"] for c in response.json()}
    assert created["id"] not in ids
