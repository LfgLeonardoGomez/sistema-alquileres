"""Owner dashboard aggregation endpoint (owner-dashboard spec; design
"Interfaces": "one endpoint, two windows, two numbers"). `from`/`to` are
half-open `[from, to)` AR local dates chosen by the caller -- via
`app.services.dates.month_window`/`week_window` -- so "month" and "week"
are both served by the same query path instead of two near-duplicate
endpoints.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import TenantSessionDep
from app.schemas.dashboard import DashboardSummary, PropertyOccupancyRead
from app.services import dashboard as dashboard_service

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    session: TenantSessionDep,
    from_: Annotated[date, Query(alias="from")],
    to: Annotated[date, Query()],
) -> DashboardSummary:
    total_collected = dashboard_service.collected(session, from_=from_, to=to)
    occupancy = dashboard_service.occupied_and_available_nights(session, from_=from_, to=to)
    return DashboardSummary(
        collected=total_collected,
        occupied_nights=sum(p.occupied_nights for p in occupancy),
        available_nights=sum(p.available_nights for p in occupancy),
        properties=[
            PropertyOccupancyRead(
                property_id=p.property_id,
                occupied_nights=p.occupied_nights,
                available_nights=p.available_nights,
            )
            for p in occupancy
        ],
    )
