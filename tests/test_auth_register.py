"""`POST /auth/register` is gated behind a shared `X-Registration-Token`
header (design D10 open question, resolved: gate it). On success it
creates the tenant and its founding owner user in one transaction and
returns an access token so the caller does not need a separate login
call."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.main import app

client = TestClient(app)

VALID_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service


def _unique_slug() -> str:
    return f"register-test-{uuid.uuid4().hex[:8]}"


def test_register_without_registration_token_header_is_rejected() -> None:
    response = client.post(
        "/auth/register",
        json={
            "tenant_slug": _unique_slug(),
            "name": "New Owner",
            "email": "owner@example.com",
            "password": "a-strong-password",
        },
    )
    assert response.status_code == 403


def test_register_with_invalid_registration_token_is_rejected() -> None:
    response = client.post(
        "/auth/register",
        headers={"X-Registration-Token": "wrong-token"},
        json={
            "tenant_slug": _unique_slug(),
            "name": "New Owner",
            "email": "owner@example.com",
            "password": "a-strong-password",
        },
    )
    assert response.status_code == 403


def test_register_with_valid_token_creates_tenant_and_owner(
    migrator_engine: Engine,
) -> None:
    slug = _unique_slug()
    response = client.post(
        "/auth/register",
        headers={"X-Registration-Token": VALID_TOKEN},
        json={
            "tenant_slug": slug,
            "name": "New Owner",
            "email": "owner@example.com",
            "password": "a-strong-password",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert "access_token" in body

    with migrator_engine.connect() as conn:
        tenant_row = conn.execute(
            text("SELECT id FROM tenants WHERE slug = :slug"), {"slug": slug}
        ).one()
        tenant_id = tenant_row[0]

        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        user_row = conn.execute(
            text("SELECT tenant_id, email FROM users WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        ).one()
    assert user_row.tenant_id == tenant_id
    assert user_row.email == "owner@example.com"


def test_registering_a_duplicate_tenant_slug_is_rejected() -> None:
    """tenant-management spec, "Slug uniqueness".

    The slug is the public identifier in `/public/{tenant_slug}/availability`,
    so two tenants sharing one would make that endpoint ambiguous about whose
    calendar it is serving. No handler special-cases this: the UNIQUE
    constraint raises, and the generic IntegrityError handler in
    `app/main.py` maps SQLSTATE 23505 to a 409. This test exists because that
    path is entirely generic -- nothing in the register handler mentions
    slugs, so nothing would obviously break if the mapping were removed.
    """
    slug = _unique_slug()
    payload = {
        "tenant_slug": slug,
        "name": "First Owner",
        "email": "first@example.com",
        "password": "a-strong-password",
    }

    first = client.post(
        "/auth/register", headers={"X-Registration-Token": VALID_TOKEN}, json=payload
    )
    assert first.status_code == 201, first.text

    duplicate = client.post(
        "/auth/register",
        headers={"X-Registration-Token": VALID_TOKEN},
        json={**payload, "email": "second@example.com"},
    )

    assert duplicate.status_code == 409, duplicate.text
