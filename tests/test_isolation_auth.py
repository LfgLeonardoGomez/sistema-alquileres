"""Cross-tenant isolation for `GET /me`, across three seeded tenants
(tenant-isolation spec: "Cross-Tenant Isolation Verified Per Endpoint").
Each tenant's token must resolve to that tenant's own identity only,
never another tenant's -- and this must hold for every pair, not just
adjacent ones."""

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import SeededTenant

client = TestClient(app)


def test_me_with_each_tenant_token_returns_only_that_tenant_identity(
    seed_three_tenants: list[SeededTenant],
) -> None:
    for tenant in seed_three_tenants:
        response = client.get(
            "/me", headers={"Authorization": f"Bearer {tenant.access_token}"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["tenant_id"] == str(tenant.id)
        assert body["user_id"] == str(tenant.owner_user_id)
        assert body["email"] == tenant.owner_email


def test_me_never_returns_another_tenants_identity(
    seed_three_tenants: list[SeededTenant],
) -> None:
    for requester in seed_three_tenants:
        response = client.get(
            "/me", headers={"Authorization": f"Bearer {requester.access_token}"}
        )
        body = response.json()
        for other in seed_three_tenants:
            if other.id == requester.id:
                continue
            assert body["tenant_id"] != str(other.id)
            assert body["user_id"] != str(other.owner_user_id)
            assert body["email"] != other.owner_email
