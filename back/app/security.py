"""Password hashing and JWT issuance (design D10, CRITICAL domain).

Hashing: Argon2id via `pwdlib`, OWASP's first recommendation -- no custom
crypto, no hand-rolled salting.

Tokens: stateless JWT, HS256, 8h expiry, claims `sub` (user id), `tid`
(tenant id), `iat`, `exp`. No refresh tokens -- re-login after 8h is
acceptable for one owner per tenant. `JWT_SECRET` has no default (see
`app.config`); the app refuses to boot without it.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

_password_hash = PasswordHash.recommended()

ACCESS_TOKEN_EXPIRY = timedelta(hours=8)
JWT_ALGORITHM = "HS256"


def hash_password(plain_password: str) -> str:
    return _password_hash.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return _password_hash.verify(plain_password, password_hash)


def create_access_token(*, user_id: uuid.UUID, tenant_id: uuid.UUID) -> str:
    now = datetime.now(tz=timezone.utc)
    claims = {
        "sub": str(user_id),
        "tid": str(tenant_id),
        "iat": now,
        "exp": now + ACCESS_TOKEN_EXPIRY,
    }
    return jwt.encode(claims, get_settings().jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises `jwt.ExpiredSignatureError` / `jwt.InvalidTokenError` (or a
    subclass) on an expired or otherwise invalid token -- callers translate
    that into a 401 (see `app.api.deps`)."""
    return jwt.decode(token, get_settings().jwt_secret, algorithms=[JWT_ALGORITHM])
