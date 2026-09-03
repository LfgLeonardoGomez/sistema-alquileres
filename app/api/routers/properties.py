"""Property CRUD (property-management spec, design D8).

No `services/` module here -- routers talk to `TenantSessionDep` directly
(design D3): this is plain CRUD with no pricing, upsert, or aggregation
logic worth a service layer.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.property import Property
from app.schemas.property import PropertyCreate, PropertyRead, PropertyUpdate

router = APIRouter(tags=["properties"])


@router.post("/properties", response_model=PropertyRead, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyCreate, principal: PrincipalDep, session: TenantSessionDep
) -> Property:
    property_ = Property(tenant_id=principal.tenant_id, name=payload.name)
    session.add(property_)
    session.flush()
    return property_


@router.get("/properties", response_model=list[PropertyRead])
def list_properties(
    session: TenantSessionDep,
    include_inactive: Annotated[bool, Query()] = False,
) -> list[Property]:
    stmt = select(Property).order_by(Property.created_at)
    if not include_inactive:
        stmt = stmt.where(Property.deleted_at.is_(None))
    return list(session.execute(stmt).scalars().all())


@router.get("/properties/{property_id}", response_model=PropertyRead)
def get_property(property_id: uuid.UUID, session: TenantSessionDep) -> Property:
    property_ = session.get(Property, property_id)
    if property_ is None:
        raise errors.not_found("Property not found")
    return property_


@router.patch("/properties/{property_id}", response_model=PropertyRead)
def update_property(
    property_id: uuid.UUID, payload: PropertyUpdate, session: TenantSessionDep
) -> Property:
    property_ = session.get(Property, property_id)
    if property_ is None:
        raise errors.not_found("Property not found")
    property_.name = payload.name
    session.flush()
    return property_


@router.delete("/properties/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(property_id: uuid.UUID, session: TenantSessionDep) -> None:
    property_ = session.get(Property, property_id)
    if property_ is None:
        raise errors.not_found("Property not found")
    property_.deleted_at = datetime.now(UTC)
