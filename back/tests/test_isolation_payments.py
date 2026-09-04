"""Cross-tenant isolation for payments (tenant-isolation spec: "Cross-
Tenant Isolation Verified Per Endpoint"). Three seeded tenants, one test
per endpoint -- POSTing or GETting payments against another tenant's
reservation must behave exactly as if that reservation did not exist
(design D11: 404, the only honest answer under RLS).
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine

from app.main import app
from tests.conftest import SeededTenant

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _headers(owner: SeededTenant) -> dict:
    return {"Authorization": f"Bearer {owner.access_token}"}


def _create_reservation(owner: SeededTenant) -> dict:
    property_id = client.post(
        "/properties", headers=_headers(owner), json={"name": "Isolation Payments Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=_headers(owner),
        json={"full_name": "Isolation Payments Guest", "phone": _unique_phone()},
    ).json()["id"]
    return client.post(
        "/reservations",
        headers=_headers(owner),
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2027-08-05",
            "check_out": "2027-08-10",
            "price_total": "1500.00",
        },
    ).json()


def test_payment_post_cross_tenant_returns_404(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    reservation = _create_reservation(owner_a)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=_headers(owner_b),
        json={"amount": "1000.00"},
    )
    assert response.status_code == 404


def test_payment_get_cross_tenant_returns_404(
    seed_three_tenants: list[SeededTenant],
) -> None:
    owner_a, owner_b, _ = seed_three_tenants
    reservation = _create_reservation(owner_a)
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=_headers(owner_a),
        json={"amount": "1000.00"},
    )

    response = client.get(
        f"/reservations/{reservation['id']}/payments", headers=_headers(owner_b)
    )
    assert response.status_code == 404


def test_payment_post_cross_tenant_creates_no_row(
    seed_three_tenants: list[SeededTenant], migrator_engine: Engine
) -> None:
    """Triangulation: the 404 must not be a lie -- the attempted
    cross-tenant POST must leave no `payments` row behind at all, not just
    a row invisible to the caller."""
    from sqlalchemy import text

    owner_a, owner_b, _ = seed_three_tenants
    reservation = _create_reservation(owner_a)

    response = client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=_headers(owner_b),
        json={"amount": "1000.00"},
    )
    assert response.status_code == 404

    with migrator_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(owner_a.id)}
        )
        count = conn.execute(
            text("SELECT count(*) FROM payments WHERE reservation_id = :rid"),
            {"rid": reservation["id"]},
        ).scalar()
    assert count == 0
