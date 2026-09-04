"""The same email may be registered independently in two different
tenants (design D10: email is unique PER TENANT, not globally) -- both
owners must be able to log in independently, with no collision or
cross-tenant confusion."""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import fresh_client_address

client = TestClient(app)

REGISTRATION_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service
SHARED_EMAIL = "same-email-shared@example.com"


def _register(slug: str, password: str, address: str) -> None:
    response = client.post(
        "/auth/register",
        headers={"X-Registration-Token": REGISTRATION_TOKEN, "X-Forwarded-For": address},
        json={
            "tenant_slug": slug,
            "name": "Shared Email Owner",
            "email": SHARED_EMAIL,
            "password": password,
        },
    )
    assert response.status_code == 201


def test_same_email_registered_in_two_tenants_logs_in_independently() -> None:
    slug_a = f"shared-email-a-{uuid.uuid4().hex[:8]}"
    slug_b = f"shared-email-b-{uuid.uuid4().hex[:8]}"
    password_a = "tenant-a-password-1"
    password_b = "tenant-b-password-2"
    # Design D24: rate-limit-key isolation only -- see
    # tests/conftest.py::fresh_client_address.
    address = fresh_client_address()

    _register(slug_a, password_a, address)
    _register(slug_b, password_b, address)

    login_a = client.post(
        "/auth/login",
        json={"tenant_slug": slug_a, "email": SHARED_EMAIL, "password": password_a},
        headers={"X-Forwarded-For": address},
    )
    login_b = client.post(
        "/auth/login",
        json={"tenant_slug": slug_b, "email": SHARED_EMAIL, "password": password_b},
        headers={"X-Forwarded-For": address},
    )

    assert login_a.status_code == 200
    assert login_b.status_code == 200
    assert login_a.json()["access_token"] != login_b.json()["access_token"]

    me_a = client.get(
        "/me", headers={"Authorization": f"Bearer {login_a.json()['access_token']}"}
    )
    me_b = client.get(
        "/me", headers={"Authorization": f"Bearer {login_b.json()['access_token']}"}
    )
    assert me_a.json()["tenant_id"] != me_b.json()["tenant_id"]
    assert me_a.json()["email"] == SHARED_EMAIL
    assert me_b.json()["email"] == SHARED_EMAIL


def test_tenant_as_password_does_not_cross_authenticate() -> None:
    """Triangulation: tenant A's password must not authenticate the
    same-email account in tenant B, and vice versa -- proves login scopes
    the password check by tenant, not just by email."""
    slug_a = f"shared-email-c-{uuid.uuid4().hex[:8]}"
    slug_b = f"shared-email-d-{uuid.uuid4().hex[:8]}"
    password_a = "tenant-c-password-1"
    password_b = "tenant-d-password-2"
    address = fresh_client_address()

    _register(slug_a, password_a, address)
    _register(slug_b, password_b, address)

    cross_response = client.post(
        "/auth/login",
        json={"tenant_slug": slug_b, "email": SHARED_EMAIL, "password": password_a},
        headers={"X-Forwarded-For": address},
    )
    assert cross_response.status_code == 401
