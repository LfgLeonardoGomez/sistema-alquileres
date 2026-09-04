"""FastAPI dependency wiring: `PrincipalDep`, `TenantSessionDep`,
`PublicSessionDep`.

The claim path is the whole point (design D4/D10): `get_current_principal`
verifies the JWT and returns `(user_id, tenant_id)`. `get_tenant_session`
depends on it, so the tenant context that ends up in `app.tenant_id` is
read only from the verified token -- never a header, query param, or body
field on an authenticated route. FastAPI resolves `PrincipalDep` before
`get_tenant_session` runs, because `get_tenant_session` declares it as a
sub-dependency; that ordering is enforced by the dependency graph, not by
convention.

`get_public_session` (design D9) is the one dependency with NO auth at
all: it resolves the tenant from the `tenant_slug` path parameter instead
of a verified token, via the same no-RLS `tenants` read `POST /auth/login`
uses, then sets `app.tenant_id` exactly the way `get_tenant_session` does
-- same `set_config(..., true)` bound-parameter call, same transaction
lifetime. It is not an RLS bypass; the tenant just comes from the URL
instead of a JWT claim. An unknown slug returns a plain 404 and reveals
nothing else about whether the tenant exists.
"""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import errors
from app.db.session import SessionLocal, tenant_scoped_session
from app.logging import get_context
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
    principal = Principal(user_id=uuid.UUID(claims["sub"]), tenant_id=uuid.UUID(claims["tid"]))
    # Mutate the correlation context dict IN PLACE -- never rebind it here.
    # See app/logging.py's module docstring for why a rebind would silently
    # break under the threadpool this sync dependency runs in.
    context = get_context()
    context["tenant_id"] = str(principal.tenant_id)
    context["user_id"] = str(principal.user_id)
    return principal


PrincipalDep = Annotated[Principal, Depends(get_current_principal)]


def get_tenant_session(principal: PrincipalDep) -> Iterator[Session]:
    with tenant_scoped_session(principal.tenant_id) as session:
        yield session


TenantSessionDep = Annotated[Session, Depends(get_tenant_session)]


def get_public_session(tenant_slug: Annotated[str, Path()]) -> Iterator[Session]:
    with SessionLocal() as session:
        tenant_id = session.execute(
            text("SELECT id FROM tenants WHERE slug = :slug"),
            {"slug": tenant_slug},
        ).scalar()
    if tenant_id is None:
        raise errors.not_found("Tenant not found")
    with tenant_scoped_session(tenant_id) as session:
        yield session


PublicSessionDep = Annotated[Session, Depends(get_public_session)]
