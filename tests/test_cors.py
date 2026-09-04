"""CORS policy (design D22, cors-policy spec).

`test_settings_rejects_wildcard_origin` follows `tests/test_config.py`'s
subprocess pattern for the same reason: `Settings()` is constructed once
at `app.config` import time, and Python caches modules, so an in-process
test could not observe a second, differently-failing construction in the
same session.

The remaining tests exercise the real, running `app` (imported once,
in-process, like every other integration test in this suite) against the
`test` Compose service's `CORS_ALLOWED_ORIGINS=https://configured-origin.
example.com` (see `docker-compose.yml`).
"""

import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

PROJECT_ROOT = Path(__file__).resolve().parents[1]

CONFIGURED_ORIGIN = "https://configured-origin.example.com"  # matches docker-compose.yml `test`
UNCONFIGURED_ORIGIN = "https://not-configured.example.com"

client = TestClient(app)

BASE_ENV = {
    "PATH": os.environ.get("PATH", ""),
    "DATABASE_URL": "postgresql+psycopg://alquileres_app:x@db:5432/alquileres",
    "JWT_SECRET": "unit-test-secret-padded-to-32-bytes",
    "REGISTRATION_TOKEN": "unit-test-registration-token",
    "ENVIRONMENT": "development",
}


def _run_settings_construction(env: dict[str, str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", "from app.config import Settings; Settings()"],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


def test_settings_rejects_wildcard_origin() -> None:
    env = dict(BASE_ENV)
    env["CORS_ALLOWED_ORIGINS"] = "*"
    result = _run_settings_construction(env)
    assert result.returncode != 0
    assert "cors_allowed_origins" in result.stderr.lower()


def test_settings_rejects_wildcard_among_configured_origins() -> None:
    env = dict(BASE_ENV)
    env["CORS_ALLOWED_ORIGINS"] = "https://a.example.com,*,https://b.example.com"
    result = _run_settings_construction(env)
    assert result.returncode != 0
    assert "cors_allowed_origins" in result.stderr.lower()


def test_settings_accepts_explicit_empty_origins() -> None:
    """An explicit empty value is a legal, deliberate answer -- "no
    browser access" -- and must NOT refuse to boot (design D22)."""
    env = dict(BASE_ENV)
    env["CORS_ALLOWED_ORIGINS"] = ""
    result = _run_settings_construction(env)
    assert result.returncode == 0, result.stderr


def test_settings_refuses_to_boot_without_cors_allowed_origins() -> None:
    """Required, no default -- same rule as `jwt_secret`/`environment`
    (design D22): an ABSENT variable means nobody ever decided the CORS
    policy, which is different from an explicit empty value."""
    env = dict(BASE_ENV)
    result = _run_settings_construction(env)
    assert result.returncode != 0
    assert "cors_allowed_origins" in result.stderr.lower()


def test_configured_origin_preflight_and_request_succeed_for_owner_scoped_route(
    registered_owner: RegisteredOwner,
) -> None:
    preflight = client.options(
        "/me",
        headers={
            "Origin": CONFIGURED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == CONFIGURED_ORIGIN
    # Correlation must still wrap CORS (design D23's nesting order) -- a
    # preflight response, including this allowed one, still gets a
    # correlation id, proving CorrelationMiddleware is outermost rather
    # than merely asserting it by reading the registration code.
    assert preflight.headers.get("x-request-id") is not None

    actual = client.get(
        "/me", headers={**registered_owner.headers, "Origin": CONFIGURED_ORIGIN}
    )
    assert actual.status_code == 200
    assert actual.headers.get("access-control-allow-origin") == CONFIGURED_ORIGIN


def test_unconfigured_origin_preflight_is_refused(registered_owner: RegisteredOwner) -> None:
    preflight = client.options(
        "/me",
        headers={
            "Origin": UNCONFIGURED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert preflight.status_code == 400
    assert "access-control-allow-origin" not in {k.lower() for k in preflight.headers}
    # Even a REJECTED preflight still produces a correlation id -- design
    # D23: "CORS preflights, including rejected ones ... produce a log
    # line on this side," which requires correlation to wrap CORS.
    assert preflight.headers.get("x-request-id") is not None

    actual = client.get(
        "/me", headers={**registered_owner.headers, "Origin": UNCONFIGURED_ORIGIN}
    )
    # CORS is enforced by the BROWSER, not the server -- the request still
    # succeeds at the HTTP level, but the response must not carry a header
    # that would grant this origin access from inside a browser.
    assert actual.status_code == 200
    assert "access-control-allow-origin" not in {k.lower() for k in actual.headers}


def test_registration_header_allowed_cross_origin() -> None:
    preflight = client.options(
        "/auth/register",
        headers={
            "Origin": CONFIGURED_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-registration-token",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == CONFIGURED_ORIGIN
    allowed_headers = {
        h.strip().lower()
        for h in preflight.headers.get("access-control-allow-headers", "").split(",")
    }
    assert "x-registration-token" in allowed_headers


def test_public_availability_endpoint_shares_the_owner_scoped_cors_policy(
    registered_owner: RegisteredOwner,
) -> None:
    """design D22: the public route deliberately has no independent CORS
    policy -- CORS is not access control, and the endpoint is already
    unauthenticated by design (D9). Confirms the same allow-list applies."""
    path = f"/public/{registered_owner.tenant_slug}/availability?from=2026-01-01&to=2026-01-02"

    allowed = client.get(path, headers={"Origin": CONFIGURED_ORIGIN})
    assert allowed.status_code == 200
    assert allowed.headers.get("access-control-allow-origin") == CONFIGURED_ORIGIN

    refused = client.get(path, headers={"Origin": UNCONFIGURED_ORIGIN})
    assert refused.status_code == 200
    assert "access-control-allow-origin" not in {k.lower() for k in refused.headers}
