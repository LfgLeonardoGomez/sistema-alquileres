"""Public availability calendar (design D9, public-availability-calendar
spec). No auth dependency -- `PublicSessionDep` (`app/api/deps.py`)
resolves the tenant from the `tenant_slug` path parameter instead of a
JWT, then applies the identical RLS mechanism as every authenticated
route.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app import errors
from app.api.deps import PublicSessionDep
from app.schemas.public import PublicAvailability, PublicContact
from app.services.public import get_public_availability, get_public_contact

router = APIRouter(tags=["public"])


@router.get("/public/{tenant_slug}/availability", response_model=list[PublicAvailability])
def public_availability(
    session: PublicSessionDep,
    from_: Annotated[date, Query(alias="from")],
    to: Annotated[date, Query()],
) -> list[PublicAvailability]:
    return get_public_availability(session, from_=from_, to=to)


@router.get("/public/{tenant_slug}/contact", response_model=PublicContact)
def public_contact(
    session: PublicSessionDep,
    tenant_slug: Annotated[str, Path()],
) -> PublicContact:
    """Design D40 -- `PublicSessionDep` already resolved `tenant_slug` and
    raised the 404 for an unknown one; this re-reads `tenants` by slug via
    `get_public_contact`'s own projection (a second lookup, accepted
    deliberately per D40 rather than widening the shared dependency)."""
    contact = get_public_contact(session, slug=tenant_slug)
    if contact is None:
        # Cannot happen after `PublicSessionDep` already validated the slug
        # on this same request, but a resolved-to-nothing lookup is a 404,
        # not a crash -- same defensive shape as `GET /tenant`.
        raise errors.not_found("Tenant not found")
    return contact
