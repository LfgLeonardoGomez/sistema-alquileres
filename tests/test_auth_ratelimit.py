"""Auth rate limiting (design D24, `authentication` spec's Rate Limiting
requirement). Exercises the real HTTP path through `TestClient(app)`.

Each test uses its own `X-Forwarded-For`-simulated address
(`tests/conftest.py::fresh_client_address`) so per-test budget exhaustion
does not cross-contaminate the process-lifetime limiter state shared by
every other test in the suite (design D24: in-process, one process per
`--workers 1`, design D19). The `test` Compose service sets
`TRUSTED_PROXY_COUNT=1` specifically so tests can simulate distinct
callers this way; `api`'s own production-shaped value is `0` (no reverse
proxy in front of it yet).
"""

import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.ratelimit import LOGIN_LIMIT, REGISTER_LIMIT
from tests.conftest import fresh_client_address

client = TestClient(app)

REGISTRATION_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service


def _login_payload(slug: str = "no-such-tenant-at-all", email: str = "nobody@example.com") -> dict:
    return {"tenant_slug": slug, "email": email, "password": "irrelevant-wrong-password"}


def _register_payload() -> dict:
    return {
        "tenant_slug": f"ratelimit-{uuid.uuid4().hex[:8]}",
        "name": "Rate Limit Test",
        "email": "owner@example.com",
        "password": "a-strong-password",
    }


def test_exceeding_the_login_budget_returns_429_with_retry_after() -> None:
    headers = {"X-Forwarded-For": fresh_client_address()}

    for _ in range(LOGIN_LIMIT):
        response = client.post("/auth/login", json=_login_payload(), headers=headers)
        assert response.status_code == 401

    blocked = client.post("/auth/login", json=_login_payload(), headers=headers)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


def test_exceeding_the_registration_budget_returns_429_with_retry_after() -> None:
    headers = {"X-Forwarded-For": fresh_client_address(), "X-Registration-Token": REGISTRATION_TOKEN}

    for _ in range(REGISTER_LIMIT):
        response = client.post("/auth/register", json=_register_payload(), headers=headers)
        assert response.status_code == 201

    blocked = client.post("/auth/register", json=_register_payload(), headers=headers)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


def test_a_caller_below_the_login_budget_still_gets_the_generic_401() -> None:
    """D24 must not change the shape of an ordinary failure -- only a
    caller who has EXHAUSTED the budget should ever see a 429 (spec
    scenario: "A caller below the budget still receives the existing
    generic 401")."""
    headers = {"X-Forwarded-For": fresh_client_address()}

    response = client.post("/auth/login", json=_login_payload(), headers=headers)

    assert response.status_code == 401


def test_the_429_response_is_not_an_account_existence_oracle() -> None:
    """The D10-preservation test. Two callers -- one exhausting the login
    budget with credentials for a REAL account, the other with a tenant
    slug/email combination that does NOT exist -- must receive
    byte-identical 429 responses: same status, same body, same headers.

    `time.monotonic` is frozen for the whole exhaustion (the limiter has
    no test-only reset hook -- freezing time is the seam that already
    exists) so both sequences compute the exact same `Retry-After`, and
    both requests carry the SAME caller-supplied `X-Request-ID` so
    correlation does not introduce an incidental difference unrelated to
    the question this test asks.
    """
    real_slug = f"oracle-real-{uuid.uuid4().hex[:8]}"
    real_email = "real-owner@example.com"
    real_password = "a-strong-real-password"
    register_response = client.post(
        "/auth/register",
        headers={"X-Registration-Token": REGISTRATION_TOKEN, "X-Forwarded-For": fresh_client_address()},
        json={
            "tenant_slug": real_slug,
            "name": "Oracle Test Owner",
            "email": real_email,
            "password": real_password,
        },
    )
    assert register_response.status_code == 201

    fixed_request_id = f"oracle-test-{uuid.uuid4().hex[:8]}"
    real_headers = {
        "X-Forwarded-For": fresh_client_address(),
        "X-Request-ID": fixed_request_id,
    }
    nonexistent_headers = {
        "X-Forwarded-For": fresh_client_address(),
        "X-Request-ID": fixed_request_id,
    }

    with patch("app.ratelimit.time.monotonic", return_value=1_000_000.0):
        for _ in range(LOGIN_LIMIT):
            response = client.post(
                "/auth/login",
                json={"tenant_slug": real_slug, "email": real_email, "password": "wrong-password"},
                headers=real_headers,
            )
            assert response.status_code == 401
        real_account_429 = client.post(
            "/auth/login",
            json={"tenant_slug": real_slug, "email": real_email, "password": "wrong-password"},
            headers=real_headers,
        )

        for _ in range(LOGIN_LIMIT):
            response = client.post("/auth/login", json=_login_payload(), headers=nonexistent_headers)
            assert response.status_code == 401
        nonexistent_account_429 = client.post(
            "/auth/login", json=_login_payload(), headers=nonexistent_headers
        )

    assert real_account_429.status_code == 429
    assert nonexistent_account_429.status_code == 429
    assert real_account_429.content == nonexistent_account_429.content
    assert dict(real_account_429.headers) == dict(nonexistent_account_429.headers)
