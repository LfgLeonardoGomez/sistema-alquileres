"""`GET /me` returns the authenticated principal's own identity, resolved
entirely from the verified JWT (design D4/D10)."""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import fresh_client_address

client = TestClient(app)

REGISTRATION_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service


def _register_and_login() -> dict:
    slug = f"me-test-{uuid.uuid4().hex[:8]}"
    email = "owner@example.com"
    password = "correct-password-123"
    register_response = client.post(
        "/auth/register",
        # Design D24: rate-limit-key isolation only -- see
        # tests/conftest.py::fresh_client_address.
        headers={"X-Registration-Token": REGISTRATION_TOKEN, "X-Forwarded-For": fresh_client_address()},
        json={"tenant_slug": slug, "name": "Me Test Owner", "email": email, "password": password},
    )
    assert register_response.status_code == 201
    return {"access_token": register_response.json()["access_token"], "email": email}


def test_me_without_token_is_rejected() -> None:
    response = client.get("/me")
    assert response.status_code == 401


def test_me_with_valid_token_returns_own_identity() -> None:
    owner = _register_and_login()

    response = client.get(
        "/me", headers={"Authorization": f"Bearer {owner['access_token']}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == owner["email"]
    assert "user_id" in body
    assert "tenant_id" in body


def test_me_with_invalid_token_is_rejected() -> None:
    """Triangulation: a syntactically-present but garbage token is a
    different failure mode than a fully missing header."""
    response = client.get("/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401
