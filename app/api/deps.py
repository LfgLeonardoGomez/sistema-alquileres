"""FastAPI dependency wiring: `PrincipalDep`, `TenantSessionDep`.

The claim path is the whole point (design D4/D10): `get_current_principal`
verifies the JWT and returns `(user_id, tenant_id)`. `get_tenant_session`
depends on it, so the tenant context that ends up in `app.tenant_id` is
read only from the verified token -- never a header, query param, or body
field on an authenticated route. FastAPI resolves `PrincipalDep` before
`get_tenant_session` runs, because `get_tenant_session` declares it as a
sub-dependency; that ordering is enforced by the dependency graph, not by
convention.
"""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import errors
from app.db.session import tenant_scoped_session
from app.security import decode_access_token

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    tenant_id: uuid.UUID


def get_current_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> Principal:
    if credentials is None:
        raise errors.unauthorized("Missing bearer token")
    try:
        claims = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        raise errors.unauthorized("Invalid or expired token") from exc
    return Principal(user_id=uuid.UUID(claims["sub"]), tenant_id=uuid.UUID(claims["tid"]))


PrincipalDep = Annotated[Principal, Depends(get_current_principal)]


def get_tenant_session(principal: PrincipalDep) -> Iterator[Session]:
    with tenant_scoped_session(principal.tenant_id) as session:
        yield session


TenantSessionDep = Annotated[Session, Depends(get_tenant_session)]
