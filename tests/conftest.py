"""Shared test fixtures.

The autouse session fixture resets the test database from scratch (drop,
recreate, seed) exactly once per test run, using the alquileres_migrator
role. Individual tests then read through the app-role engine, matching how
the real API connects (see design D5's structural note: tests that connect
as the migrator prove nothing about isolation).
"""

import os
import uuid
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text

from app.db import bootstrap
from app.main import app
from app.security import create_access_token, decode_access_token, hash_password
from scripts import seed as seed_script

_client = TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def _reset_and_seed_test_database() -> None:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
        bootstrap.reset_database(engine)
        seed_script.run(engine)
    finally:
        engine.dispose()


@pytest.fixture(scope="session")
def migrator_engine() -> Engine:
    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def app_engine() -> Engine:
    engine = create_engine(os.environ["DATABASE_URL"])
    yield engine
    engine.dispose()


@dataclass(frozen=True)
class SeededTenant:
    id: uuid.UUID
    slug: str
    owner_user_id: uuid.UUID
    owner_email: str
    owner_password: str
    access_token: str


def _seed_one_tenant(migrator_engine: Engine, index: int) -> SeededTenant:
    """Insert one tenant + owner user directly as `alquileres_migrator`
    (design Testing Strategy: "fixtures that set up and tear down use
    alquileres_migrator"). `users` FORCES row-level security, which applies
    even to the table owner (design D5's "belt"), so this must set
    `app.tenant_id` in the same transaction before the INSERT satisfies the
    policy's WITH CHECK clause -- exactly like the real registration flow."""
    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()
    slug = f"isolation-tenant-{index}-{uuid.uuid4().hex[:8]}"
    email = f"owner-{index}@isolation-test.example.com"
    password = f"owner-{index}-password"

    with migrator_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO tenants (id, slug, name) VALUES (:id, :slug, :name)"),
            {"id": tenant_id, "slug": slug, "name": f"Isolation Test Tenant {index}"},
        )
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        conn.execute(
            text(
                "INSERT INTO users (id, tenant_id, email, password_hash) "
                "VALUES (:id, :tid, :email, :password_hash)"
            ),
            {
                "id": user_id,
                "tid": tenant_id,
                "email": email,
                "password_hash": hash_password(password),
            },
        )

    return SeededTenant(
        id=tenant_id,
        slug=slug,
        owner_user_id=user_id,
        owner_email=email,
        owner_password=password,
        access_token=create_access_token(user_id=user_id, tenant_id=tenant_id),
    )


@pytest.fixture
def seed_three_tenants(migrator_engine: Engine) -> list[SeededTenant]:
    """3 tenants, not 2 (design Testing Strategy): two tenants hide bugs
    that leak in only one direction. Each has exactly one owner user,
    created via `alquileres_migrator`; the app under test always connects
    as `alquileres_app` (design D5)."""
    return [_seed_one_tenant(migrator_engine, i) for i in range(3)]


@dataclass(frozen=True)
class RegisteredOwner:
    tenant_id: uuid.UUID
    tenant_slug: str
    access_token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}


@pytest.fixture
def registered_owner() -> RegisteredOwner:
    """Registers a brand-new tenant through the real `POST /auth/register`
    HTTP path (not a direct DB insert) and returns its access token. Used
    by single-tenant resource-CRUD tests (properties, clients) that don't
    need the 3-tenant isolation fixture (`seed_three_tenants`)."""
    slug = f"owner-test-{uuid.uuid4().hex[:8]}"
    response = _client.post(
        "/auth/register",
        headers={"X-Registration-Token": os.environ["REGISTRATION_TOKEN"]},
        json={
            "tenant_slug": slug,
            "name": "Test Owner",
            "email": f"owner-{uuid.uuid4().hex[:8]}@example.com",
            "password": "a-strong-password",
        },
    )
    access_token = response.json()["access_token"]
    tenant_id = uuid.UUID(decode_access_token(access_token)["tid"])
    return RegisteredOwner(tenant_id=tenant_id, tenant_slug=slug, access_token=access_token)
