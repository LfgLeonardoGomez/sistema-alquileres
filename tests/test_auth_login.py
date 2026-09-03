"""`POST /auth/login` resolves the tenant by slug (no-RLS `tenants` read),
then looks up the user under RLS and verifies the password. Failure
returns the SAME generic 401 regardless of which of the three things was
wrong (design D10) -- the endpoint must not be an enumeration oracle."""

import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

REGISTRATION_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service


def _register_owner() -> dict:
    slug = f"login-test-{uuid.uuid4().hex[:8]}"
    email = "owner@example.com"
    password = "correct-password-123"
    response = client.post(
        "/auth/register",
        headers={"X-Registration-Token": REGISTRATION_TOKEN},
        json={
            "tenant_slug": slug,
            "name": "Login Test Owner",
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 201
    return {"slug": slug, "email": email, "password": password}


def test_login_with_correct_credentials_returns_token() -> None:
    owner = _register_owner()

    response = client.post(
        "/auth/login",
        json={
            "tenant_slug": owner["slug"],
            "email": owner["email"],
            "password": owner["password"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_with_wrong_slug_returns_generic_401() -> None:
    owner = _register_owner()

    response = client.post(
        "/auth/login",
        json={
            "tenant_slug": "no-such-tenant-slug",
            "email": owner["email"],
            "password": owner["password"],
        },
    )

    assert response.status_code == 401
    wrong_slug_detail = response.json()["detail"]

    wrong_email_response = client.post(
        "/auth/login",
        json={
            "tenant_slug": owner["slug"],
            "email": "not-the-owner@example.com",
            "password": owner["password"],
        },
    )
    assert wrong_email_response.status_code == 401
    assert wrong_email_response.json()["detail"] == wrong_slug_detail

    wrong_password_response = client.post(
        "/auth/login",
        json={
            "tenant_slug": owner["slug"],
            "email": owner["email"],
            "password": "totally-wrong-password",
        },
    )
    assert wrong_password_response.status_code == 401
    assert wrong_password_response.json()["detail"] == wrong_slug_detail
