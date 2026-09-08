"""`POST /auth/register` is gated behind a shared `X-Registration-Token`
header (design D10 open question, resolved: gate it). On success it
creates the tenant and its founding owner user in one transaction and
returns an access token so the caller does not need a separate login
call."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.main import app
from tests.conftest import fresh_client_address

client = TestClient(app)

VALID_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service


def _unique_slug() -> str:
    return f"register-test-{uuid.uuid4().hex[:8]}"


def test_register_without_registration_token_header_is_rejected() -> None:
    response = client.post(
        "/auth/register",
        # Design D24: rate-limit-key isolation only -- see
        # tests/conftest.py::fresh_client_address.
        headers={"X-Forwarded-For": fresh_client_address()},
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
        headers={"X-Registration-Token": "wrong-token", "X-Forwarded-For": fresh_client_address()},
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
        headers={"X-Registration-Token": VALID_TOKEN, "X-Forwarded-For": fresh_client_address()},
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
    address = fresh_client_address()
    payload = {
        "tenant_slug": slug,
        "name": "First Owner",
        "email": "first@example.com",
        "password": "a-strong-password",
    }

    first = client.post(
        "/auth/register",
        headers={"X-Registration-Token": VALID_TOKEN, "X-Forwarded-For": address},
        json=payload,
    )
    assert first.status_code == 201, first.text

    duplicate = client.post(
        "/auth/register",
        headers={"X-Registration-Token": VALID_TOKEN, "X-Forwarded-For": address},
        json={**payload, "email": "second@example.com"},
    )

    assert duplicate.status_code == 409, duplicate.text


# ---- tenant_slug format validation (design D11: Pydantic first, migration
# `0004`'s `tenants_slug_format` CHECK as the concurrent-safe backstop).
# `LoginRequest.tenant_slug` is deliberately untouched -- see
# tests/test_auth_login.py::test_login_accepts_a_slug_shape_registration_would_now_reject
# for that regression guard. ----


def _attempt_register(slug: str):
    return client.post(
        "/auth/register",
        headers={"X-Registration-Token": VALID_TOKEN, "X-Forwarded-For": fresh_client_address()},
        json={
            "tenant_slug": slug,
            "name": "New Owner",
            "email": f"owner-{uuid.uuid4().hex[:8]}@example.com",
            "password": "a-strong-password",
        },
    )


def _assert_no_tenant_with_slug(migrator_engine: Engine, slug: str) -> None:
    with migrator_engine.connect() as conn:
        row = conn.execute(text("SELECT 1 FROM tenants WHERE slug = :slug"), {"slug": slug}).first()
    assert row is None


def test_register_with_well_formed_slug_succeeds() -> None:
    response = _attempt_register("aya")
    assert response.status_code == 201, response.text


def test_register_rejects_slug_with_a_space(migrator_engine: Engine) -> None:
    response = _attempt_register("aya slug")
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, "aya slug")


def test_register_rejects_slug_with_a_character_outside_allowed_set(
    migrator_engine: Engine,
) -> None:
    response = _attempt_register("aya!")
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, "aya!")


def test_register_rejects_empty_slug(migrator_engine: Engine) -> None:
    response = _attempt_register("")
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, "")


def test_register_rejects_over_length_slug(migrator_engine: Engine) -> None:
    slug = "a" * 64
    response = _attempt_register(slug)
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, slug)


def test_register_rejects_under_length_slug(migrator_engine: Engine) -> None:
    response = _attempt_register("ab")
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, "ab")


def test_register_rejects_slug_with_leading_hyphen(migrator_engine: Engine) -> None:
    response = _attempt_register("-aya")
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, "-aya")


def test_register_rejects_slug_with_consecutive_hyphens(migrator_engine: Engine) -> None:
    response = _attempt_register("aya--rentals")
    assert response.status_code == 422
    _assert_no_tenant_with_slug(migrator_engine, "aya--rentals")


def test_register_normalises_uppercase_slug_to_lowercase_in_db(migrator_engine: Engine) -> None:
    raw_slug = f"AYA-{uuid.uuid4().hex[:8].upper()}"
    response = _attempt_register(raw_slug)
    assert response.status_code == 201, response.text

    with migrator_engine.connect() as conn:
        stored = conn.execute(
            text("SELECT slug FROM tenants WHERE slug = :slug"), {"slug": raw_slug.lower()}
        ).scalar()
    assert stored == raw_slug.lower()


def test_register_normalises_surrounding_whitespace_in_db(migrator_engine: Engine) -> None:
    core_slug = f"aya-{uuid.uuid4().hex[:8]}"
    response = _attempt_register(f"  {core_slug}  ")
    assert response.status_code == 201, response.text

    with migrator_engine.connect() as conn:
        stored = conn.execute(
            text("SELECT slug FROM tenants WHERE slug = :slug"), {"slug": core_slug}
        ).scalar()
    assert stored == core_slug


def test_direct_insert_with_invalid_slug_format_raises_23514(app_engine: Engine) -> None:
    """The concurrency-safe backstop (design D11), proven independently of
    the Pydantic 422 path above -- migration `0004`'s `tenants_slug_format`
    CHECK. Connects as `alquileres_app`, the same role the real API uses;
    `tenants_insert`'s RLS policy is `WITH CHECK (true)` for this role
    (migration `0002`), so the CHECK constraint is the only thing standing
    between this INSERT and a badly-shaped row landing in the table."""
    with pytest.raises(IntegrityError) as exc_info:
        with app_engine.begin() as conn:
            conn.execute(
                text("INSERT INTO tenants (id, slug, name) VALUES (:id, :slug, :name)"),
                {"id": uuid.uuid4(), "slug": "Not A Valid Slug!", "name": "Bad Slug Tenant"},
            )

    assert exc_info.value.orig.sqlstate == "23514"
