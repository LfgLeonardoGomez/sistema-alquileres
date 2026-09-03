"""Password hashing (Argon2id, design D10) and JWT issuance/decoding
(HS256, 8h expiry, `sub`/`tid`/`iat`/`exp` claims, design D10)."""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password_round_trip() -> None:
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed) is True


def test_verify_password_rejects_wrong_password() -> None:
    hashed = hash_password("correct horse battery staple")
    assert verify_password("wrong password", hashed) is False


def test_hash_password_is_not_the_plaintext() -> None:
    """Triangulation: a different input produces a different, non-plaintext
    hash -- proves this isn't a no-op passthrough."""
    hashed = hash_password("another-password-entirely")
    assert hashed != "another-password-entirely"
    assert verify_password("another-password-entirely", hashed) is True
    assert verify_password("correct horse battery staple", hashed) is False


def test_create_and_decode_jwt_round_trip() -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token = create_access_token(user_id=user_id, tenant_id=tenant_id)
    claims = decode_access_token(token)

    assert claims["sub"] == str(user_id)
    assert claims["tid"] == str(tenant_id)
    assert "iat" in claims
    assert "exp" in claims


def test_create_access_token_expires_in_eight_hours() -> None:
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token = create_access_token(user_id=user_id, tenant_id=tenant_id)
    claims = decode_access_token(token)

    issued_at = datetime.fromtimestamp(claims["iat"], tz=timezone.utc)
    expires_at = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    assert expires_at - issued_at == timedelta(hours=8)


def test_decode_access_token_rejects_expired_token() -> None:
    from app.config import get_settings

    settings = get_settings()
    now = datetime.now(tz=timezone.utc)
    expired_token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "tid": str(uuid.uuid4()),
            "iat": now - timedelta(hours=9),
            "exp": now - timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired_token)


def test_decode_access_token_rejects_invalid_signature() -> None:
    tampered_token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "tid": str(uuid.uuid4()),
            "iat": datetime.now(tz=timezone.utc),
            "exp": datetime.now(tz=timezone.utc) + timedelta(hours=8),
        },
        "a-completely-different-secret",
        algorithm="HS256",
    )

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered_token)
