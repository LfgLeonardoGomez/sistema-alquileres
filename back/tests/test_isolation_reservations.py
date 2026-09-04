"""Cross-tenant isolation for reservations (tenant-isolation spec:
"Cross-Tenant Isolation Verified Per Endpoint"). Three seeded tenants, one
test per endpoint -- reading, mutating, or listing another tenant's
reservation must behave exactly as if it did not exist (design D11: 404,
not 403, is the only honest answer under RLS).
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


def _headers(owner: SeededTenant) -> dict:
    return {"Authorization": f"Bearer {owner.access_token}"}


def _create_property(owner: SeededTenant, name: str) -> str:
    return client.post("/properties", headers=_headers(owner), json={"name": name}).json()["id"]


def _create_client(owner: SeededTenant, full_name: str) -> str:
    return client.post(
        "/clients", headers=_headers(owner), json={"full_name": full_name, "phone": _unique_phone()}
    ).json()["id"]


def _create_reservation(owner: SeededTenant, check_in: str, check_out: str) -> dict:
    property_id = _create_property(owner, "Isolation Cabin")
    client_id = _create_client(owner, "Isolation Guest")
    return client.post(
        "/reservations",
        headers=_headers(owner),
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": check_in,
            "check_out": check_out,
            "price_total": "1500.00",
        },
    ).json()


def test_reservation_get_cross_tenant_returns_404(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    reservation = _create_reservation(owner_a, "2027-01-05", "2027-01-10")

    response = client.get(
        f"/reservations/{reservation['id']}", headers=_headers(owner_b)
    )
    assert response.status_code == 404


def test_reservation_patch_cross_tenant_returns_404_and_leaves_row_unchanged(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    reservation = _create_reservation(owner_a, "2027-02-05", "2027-02-10")

    response = client.patch(
        f"/reservations/{reservation['id']}",
        headers=_headers(owner_b),
        json={"check_out": "2027-02-20"},
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        row = conn.execute(
            text("SELECT check_out FROM reservations WHERE id = :id"),
            {"id": reservation["id"]},
        ).one()
    assert row.check_out.isoformat() == "2027-02-10"


def test_reservation_cancel_cross_tenant_returns_404_and_leaves_status_unchanged(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    reservation = _create_reservation(owner_a, "2027-03-05", "2027-03-10")

    response = client.post(
        f"/reservations/{reservation['id']}/cancel", headers=_headers(owner_b)
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        row = conn.execute(
            text("SELECT status FROM reservations WHERE id = :id"),
            {"id": reservation["id"]},
        ).one()
    assert row.status == "reserved"


def test_reservation_list_excludes_other_tenants(seed_three_tenants: list[SeededTenant]) -> None:
    owner_a, owner_b, owner_c = seed_three_tenants
    reservation_a = _create_reservation(owner_a, "2027-04-05", "2027-04-10")
    _create_reservation(owner_b, "2027-04-05", "2027-04-10")

    response = client.get("/reservations", headers=_headers(owner_c))
    assert response.status_code == 200
    ids = {r["id"] for r in response.json()}
    assert reservation_a["id"] not in ids


def test_reservation_create_is_scoped_to_authenticated_tenant(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    created = _create_reservation(owner_a, "2027-05-05", "2027-05-10")

    response = client.get("/reservations", headers=_headers(owner_b))
    ids = {r["id"] for r in response.json()}
    assert created["id"] not in ids


def test_reservation_create_rejects_cross_tenant_property_id(
    seed_three_tenants: list[SeededTenant],
) -> None:
    """The composite FK closes the hole a plain FK would leave open (design
    D6): a property id belonging to tenant A cannot be referenced by a
    reservation created under tenant B's token, even though tenant B could
    never have seen tenant A's property id through the API."""
    owner_a, owner_b, _ = seed_three_tenants
    property_id = _create_property(owner_a, "Tenant A Only Cabin")
    client_id = _create_client(owner_b, "Tenant B Guest")

    response = client.post(
        "/reservations",
        headers=_headers(owner_b),
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2027-06-05",
            "check_out": "2027-06-10",
            "price_total": "1500.00",
        },
    )
    assert response.status_code == 404
