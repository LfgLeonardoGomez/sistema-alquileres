"""Password/token redaction (design D23, request-logging spec).

These are negative, string-absence assertions -- the same shape as D9's
raw-body contract test. `caplog` captures every `LogRecord` propagated to
the root logger, at every level, regardless of which formatter or handler
(if any) is attached to it -- so this test exercises the real logging
pipeline end to end rather than only the JSON formatter added later in
this phase.
"""

import logging
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

REGISTRATION_TOKEN = "test-registration-token"  # matches docker-compose.yml `test` service


def _all_captured_text(caplog: object) -> str:
    """Every formatted message plus every positional arg, across every
    captured record -- broader than `record.getMessage()` alone, so a
    value passed as a bare `%s` arg could not slip past the check."""
    chunks: list[str] = []
    for record in caplog.records:  # type: ignore[attr-defined]
        chunks.append(record.getMessage())
        chunks.append(str(record.args))
    return "\n".join(chunks)


def test_login_does_not_leak_the_submitted_password(caplog) -> None:
    password = f"known-password-{uuid.uuid4().hex}"
    slug = f"logredact-login-{uuid.uuid4().hex[:8]}"

    with caplog.at_level(logging.DEBUG):
        # Outcome 1: tenant/account does not exist yet -- still must not
        # leak the attempted password.
        client.post(
            "/auth/login",
            json={"tenant_slug": slug, "email": "nobody@example.com", "password": password},
        )
        client.post(
            "/auth/register",
            headers={"X-Registration-Token": REGISTRATION_TOKEN},
            json={
                "tenant_slug": slug,
                "name": "Redaction Test Owner",
                "email": "owner@example.com",
                "password": password,
            },
        )
        # Outcome 2: wrong password against a real account.
        client.post(
            "/auth/login",
            json={"tenant_slug": slug, "email": "owner@example.com", "password": "wrong"},
        )
        # Outcome 3: correct password, real success.
        client.post(
            "/auth/login",
            json={"tenant_slug": slug, "email": "owner@example.com", "password": password},
        )

    assert password not in _all_captured_text(caplog)


def test_register_does_not_leak_the_registration_token(caplog) -> None:
    slug = f"logredact-register-{uuid.uuid4().hex[:8]}"

    with caplog.at_level(logging.DEBUG):
        # Outcome 1: wrong token, rejected (403).
        client.post(
            "/auth/register",
            headers={"X-Registration-Token": "a-completely-wrong-token"},
            json={
                "tenant_slug": slug,
                "name": "Redaction Test Owner",
                "email": "owner@example.com",
                "password": "a-strong-password",
            },
        )
        # Outcome 2: correct token, succeeds (201) -- the real secret value
        # must not leak either, and this is the call most likely to log
        # full request context since it is the "interesting" path.
        client.post(
            "/auth/register",
            headers={"X-Registration-Token": REGISTRATION_TOKEN},
            json={
                "tenant_slug": slug,
                "name": "Redaction Test Owner",
                "email": "owner@example.com",
                "password": "a-strong-password",
            },
        )

    assert REGISTRATION_TOKEN not in _all_captured_text(caplog)
