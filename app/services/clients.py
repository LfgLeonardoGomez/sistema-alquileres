"""Find-or-create-or-reactivate for clients (design D8).

The usual soft-delete pattern (a partial unique index `WHERE deleted_at IS
NULL`) is wrong for `clients.phone`: the product decision requires the
collision to happen against a soft-deleted row so it can be reactivated by
the SAME conflict target the database already enforces
(`clients_tenant_phone_uq`, a FULL unique constraint -- see
`app/models/client.py`). One atomic `INSERT ... ON CONFLICT ... DO UPDATE`
avoids a read-then-write race entirely.

`was_created` is read from `xmax = 0` in the RETURNING clause: a genuine
INSERT leaves `xmax` at 0, while an `ON CONFLICT DO UPDATE` sets it to the
updating transaction's id.

The client's name is deliberately never overwritten here on reactivation --
only `deleted_at` is cleared. Name edits go through `PATCH /clients/{id}`,
so a typo in the payload that triggered find-or-create cannot silently
rename an existing client (design D8).
"""

import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session


def upsert_or_reactivate_client(
    session: Session,
    *,
    tenant_id: uuid.UUID,
    full_name: str,
    phone: str,
    email: str | None = None,
    national_id: str | None = None,
) -> tuple[uuid.UUID, bool]:
    """Insert a new client, or reactivate (clear `deleted_at` on) an
    existing one matched by `(tenant_id, phone)`. Returns `(client_id,
    was_created)`.

    `tenant_id` is passed explicitly and bound as a parameter -- this
    statement runs inside a `TenantSessionDep`-scoped transaction, so RLS's
    `WITH CHECK` also enforces that the inserted/updated row belongs to the
    caller's own tenant; the explicit bind is defense in depth, not a
    substitute for that policy.
    """
    row = session.execute(
        text(
            """
            INSERT INTO clients (id, tenant_id, full_name, phone, email, national_id)
            VALUES (:id, :tenant_id, :full_name, :phone, :email, :national_id)
            ON CONFLICT (tenant_id, phone) DO UPDATE SET deleted_at = NULL
            RETURNING id, (xmax = 0) AS was_created
            """
        ),
        {
            "id": uuid.uuid4(),
            "tenant_id": tenant_id,
            "full_name": full_name,
            "phone": phone,
            "email": email,
            "national_id": national_id,
        },
    ).one()
    return row.id, row.was_created
