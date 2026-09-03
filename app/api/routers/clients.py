"""Client CRUD (client-management spec, design D8).

`POST /clients` calls `upsert_or_reactivate_client` (`app/services/clients.py`)
directly -- it IS the find-or-create-or-reactivate entrypoint, not a plain
insert. `GET`/list add the `deleted_at IS NULL` filter explicitly at the
call site (design D8: "explicit at the call site beats implicit
everywhere") -- `GET` by id deliberately does NOT filter, so a historical
read through a past reservation (once reservations exist, Phase 4) still
resolves an inactive client.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app import errors
from app.api.deps import PrincipalDep, TenantSessionDep
from app.models.client import Client
from app.schemas.client import ClientCreate, ClientRead, ClientUpdate
from app.services.clients import upsert_or_reactivate_client

router = APIRouter(tags=["clients"])


@router.post("/clients", response_model=ClientRead)
def create_client(
    payload: ClientCreate,
    principal: PrincipalDep,
    session: TenantSessionDep,
    response: Response,
) -> Client:
    client_id, was_created = upsert_or_reactivate_client(
        session,
        tenant_id=principal.tenant_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        national_id=payload.national_id,
    )
    response.status_code = status.HTTP_201_CREATED if was_created else status.HTTP_200_OK
    return session.get(Client, client_id)  # type: ignore[return-value]


@router.get("/clients", response_model=list[ClientRead])
def list_clients(
    session: TenantSessionDep,
    include_inactive: Annotated[bool, Query()] = False,
) -> list[Client]:
    stmt = select(Client).order_by(Client.created_at)
    if not include_inactive:
        stmt = stmt.where(Client.deleted_at.is_(None))
    return list(session.execute(stmt).scalars().all())


@router.get("/clients/{client_id}", response_model=ClientRead)
def get_client(client_id: uuid.UUID, session: TenantSessionDep) -> Client:
    client = session.get(Client, client_id)
    if client is None:
        raise errors.not_found("Client not found")
    return client


@router.patch("/clients/{client_id}", response_model=ClientRead)
def update_client(
    client_id: uuid.UUID, payload: ClientUpdate, session: TenantSessionDep
) -> Client:
    client = session.get(Client, client_id)
    if client is None:
        raise errors.not_found("Client not found")
    if payload.full_name is not None:
        client.full_name = payload.full_name
    if payload.phone is not None:
        client.phone = payload.phone
    if payload.email is not None:
        client.email = payload.email
    if payload.national_id is not None:
        client.national_id = payload.national_id
    # Explicit flush, not left to the session dependency's implicit commit
    # (design D6's rationale, applied here too): a constraint violation must
    # raise while the handler is still on the stack, so the IntegrityError
    # handler in app/errors.py can still shape the response.
    session.flush()
    return client


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: uuid.UUID, session: TenantSessionDep) -> None:
    client = session.get(Client, client_id)
    if client is None:
        raise errors.not_found("Client not found")
    client.deleted_at = datetime.now(UTC)
