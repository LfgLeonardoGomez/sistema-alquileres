"""Shared test fixtures.

The autouse session fixture resets the test database from scratch
(migrate down to nothing, migrate back up to head, seed) exactly once per
test run, using the alquileres_migrator role. Individual tests then read
through the app-role engine, matching how the real API connects (see
design D5's structural note: tests that connect as the migrator prove
nothing about isolation).

The schema is built through Alembic -- the single construction mechanism
also used at deployment (design D13/D15). Invoked programmatically via
`alembic.config.Config` + `alembic.command`, not `subprocess`, so a
migration failure raises here with a real traceback instead of surfacing
as an opaque non-zero exit code.
"""

import itertools
import os
import uuid
from dataclasses import dataclass

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text

# noqa: F401 -- import kept for its side effect: it registers every model
# on Base.metadata, which migrations/env.py's target_metadata and
# tests/test_schema_is_migrated.py's compare_metadata() check both depend
# on (design D13).
from app import models  # noqa: F401
from app.main import app
from app.security import create_access_token, decode_access_token, hash_password
from scripts import seed as seed_script

_client = TestClient(app)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_ip_sequence = itertools.count(1)


def fresh_client_address() -> str:
    """A syntactically address-shaped, guaranteed-unique-within-this-test-
    session string (design D24). `TestClient`'s in-process ASGI transport
    reports the SAME synthetic `request.client.host` for every request in
    the whole session, and the rate limiter's state is process-lifetime by
    design (D19: `--workers 1`) -- without varying the address per caller,
    the suite's own legitimate `POST /auth/register`/`POST /auth/login`
    traffic (dozens of calls, mostly via `registered_owner` below) would
    exhaust the real budget and start seeing `429` where it expects `201`/
    `200`. The `test` Compose service sets `TRUSTED_PROXY_COUNT=1`
    specifically so tests can simulate distinct callers via
    `X-Forwarded-For` this way; `api`'s own value is `0` (no reverse
    proxy in front of it). Not a real routable address -- the limiter
    treats the header entry as an opaque string."""
    n = next(_ip_sequence)
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}"


def _alembic_config() -> Config:
    config = Config(os.path.join(_REPO_ROOT, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(_REPO_ROOT, "migrations"))
    return config


@pytest.fixture(scope="session", autouse=True)
def _reset_and_seed_test_database() -> None:
    config = _alembic_config()
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    engine = create_engine(os.environ["MIGRATOR_DATABASE_URL"])
    try:
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
        headers={
            "X-Registration-Token": os.environ["REGISTRATION_TOKEN"],
            # See `fresh_client_address`'s docstring -- keeps this fixture's
            # heavy call volume from exhausting the shared rate-limit
            # budget (design D24).
            "X-Forwarded-For": fresh_client_address(),
        },
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
