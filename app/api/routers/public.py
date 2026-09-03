"""Public availability calendar (design D9, public-availability-calendar
spec). No auth dependency -- `PublicSessionDep` (`app/api/deps.py`)
resolves the tenant from the `tenant_slug` path parameter instead of a
JWT, then applies the identical RLS mechanism as every authenticated
route.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import PublicSessionDep
from app.schemas.public import PublicAvailability
from app.services.public import get_public_availability

router = APIRouter(tags=["public"])


@router.get("/public/{tenant_slug}/availability", response_model=list[PublicAvailability])
def public_availability(
    session: PublicSessionDep,
    from_: Annotated[date, Query(alias="from")],
    to: Annotated[date, Query()],
) -> list[PublicAvailability]:
    return get_public_availability(session, from_=from_, to=to)
