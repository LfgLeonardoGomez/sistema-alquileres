"""Registration, login, and `GET /me` (design D10, CRITICAL domain).

Both the two reads that legitimately precede tenant context (login's tenant
resolution, registration's tenant insert) are handled without any RLS
bypass -- see design D5: `tenants` is a global table with no RLS, and both
routes set `app.tenant_id` before touching `users`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Header, status
from sqlalchemy import text

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.config import get_settings
from app.db.session import SessionLocal, tenant_scoped_session
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    x_registration_token: Annotated[str | None, Header()] = None,
) -> TokenResponse:
    settings = get_settings()
    if x_registration_token != settings.registration_token:
        raise errors.forbidden("Invalid or missing registration token")

    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()
    password_hash = hash_password(payload.password)

    with tenant_scoped_session(tenant_id) as session:
        session.execute(
            text("INSERT INTO tenants (id, slug, name) VALUES (:id, :slug, :name)"),
            {"id": tenant_id, "slug": payload.tenant_slug, "name": payload.name},
        )
        session.execute(
            text(
                "INSERT INTO users (id, tenant_id, email, password_hash) "
                "VALUES (:id, :tid, :email, :password_hash)"
            ),
            {
                "id": user_id,
                "tid": tenant_id,
                "email": payload.email,
                "password_hash": password_hash,
            },
        )

    access_token = create_access_token(user_id=user_id, tenant_id=tenant_id)
    return TokenResponse(access_token=access_token)


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    # Tenant resolution reads the GLOBAL, un-RLS'd `tenants` table (design
    # D5) -- there is no tenant context to set yet, that is what this step
    # produces. A missing slug and a missing/wrong email/password all end
    # up at the same generic 401 below; this endpoint is not an
    # enumeration oracle for tenants or accounts (design D10).
    with SessionLocal() as session:
        tenant_id = session.execute(
            text("SELECT id FROM tenants WHERE slug = :slug"),
            {"slug": payload.tenant_slug},
        ).scalar()

    if tenant_id is not None:
        with tenant_scoped_session(tenant_id) as session:
            user_row = session.execute(
                text("SELECT id, password_hash FROM users WHERE email = :email"),
                {"email": payload.email},
            ).first()
    else:
        user_row = None

    if user_row is None or not verify_password(payload.password, user_row.password_hash):
        raise errors.unauthorized("Invalid tenant slug, email, or password")

    access_token = create_access_token(user_id=user_row.id, tenant_id=tenant_id)
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=MeResponse)
def me(principal: PrincipalDep, session: TenantSessionDep) -> MeResponse:
    email = session.execute(
        text("SELECT email FROM users WHERE id = :id"), {"id": principal.user_id}
    ).scalar_one()
    return MeResponse(user_id=principal.user_id, tenant_id=principal.tenant_id, email=email)
