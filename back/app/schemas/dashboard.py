"""Dashboard I/O models (owner-dashboard spec). `DashboardSummary` carries
exactly `collected`, `occupied_nights`, `available_nights`, and a
per-property breakdown -- no second, accrual-basis income field (spec "No
Accrual-Basis Income Metric").
"""

import uuid
from decimal import Decimal

from pydantic import BaseModel


class PropertyOccupancyRead(BaseModel):
    property_id: uuid.UUID
    occupied_nights: int
    available_nights: int


class DashboardSummary(BaseModel):
    collected: Decimal
    occupied_nights: int
    available_nights: int
    properties: list[PropertyOccupancyRead]
