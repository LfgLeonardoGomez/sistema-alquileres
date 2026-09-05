"""`GET`/`PATCH /tenant` (design D38, D39) -- the authenticated tenant
self-service surface. Not folded into `auth.py`: `GET /me` is about the
*user*, this is about the *tenant*.

Both routes carry no tenant identifier in the request surface at all (D38
Layer 1) -- no path parameter, no query parameter, and `TenantUpdate`'s
`extra="forbid"` turns an attempt to invent a body field that names a
tenant into a 422. The row is always resolved via `principal.tenant_id`,
decoded from the verified JWT (D38 Layer 2). Layers 3 (column-scoped
`GRANT UPDATE`) and 4 (per-command RLS) live in the database, migration
`0002`, and are proved in `tests/test_tenants_rls.py`.
"""

from fastapi import APIRouter

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.tenant import Tenant
from app.schemas.tenant import TenantRead, TenantUpdate

router = APIRouter(tags=["tenant"])


@router.get("/tenant", response_model=TenantRead)
def get_tenant(principal: PrincipalDep, session: TenantSessionDep) -> Tenant:
    tenant = session.get(Tenant, principal.tenant_id)
    if tenant is None:
        # Cannot happen on a live token (the tenant that issued it exists),
        # but a resolved-to-nothing lookup is a 404, not a 500 or a crash.
        raise errors.not_found("Tenant not found")
    return tenant


@router.patch("/tenant", response_model=TenantRead)
def update_tenant(
    payload: TenantUpdate, principal: PrincipalDep, session: TenantSessionDep
) -> Tenant:
    tenant = session.get(Tenant, principal.tenant_id)
    if tenant is None:
        raise errors.not_found("Tenant not found")

    # `exclude_unset=True`: an OMITTED `whatsapp` never appears in this
    # dict at all (no-op), while an EXPLICIT `null` appears as
    # `{"whatsapp": None}` (clears it). `model_dump()` without
    # `exclude_unset` would collapse both cases into the same `None`.
    updates = payload.model_dump(exclude_unset=True)
    if "whatsapp" in updates:
        tenant.whatsapp = updates["whatsapp"]
    # Explicit flush (design D6's rationale, matching clients.py's
    # update_client): a CHECK violation must raise while this handler is
    # still on the stack, so app/errors.py's IntegrityError handler can
    # shape the response.
    session.flush()
    return tenant
