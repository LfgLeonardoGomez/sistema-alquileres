"""tenant whatsapp

Adds a nullable public contact column to `tenants` and, for the first
time, a write path to that table (design D38, D39). Four independent
defense layers protect the write; two of them are in this migration:

  Layer 3 -- a column-scoped `GRANT UPDATE (whatsapp) ON tenants`, so
  `UPDATE tenants SET slug = ...` as `alquileres_app` fails on the grant
  alone, regardless of any policy. The app role holds only `SELECT,
  INSERT` on `tenants` today (`migrations/versions/0001_baseline.py`,
  the grant near the end of `upgrade()`), and PostgreSQL checks column
  privileges independently of RLS.

  Layer 4 -- per-command RLS on `tenants`, `ENABLE`d but **not**
  `FORCE`d (deliberate: `alquileres_app` is not the table owner, so
  plain `ENABLE` binds it completely; `FORCE` would only constrain
  `alquileres_migrator`, whose `tenants` traffic is exactly the
  bootstrap path, and would impose a standing rule --
  "set `app.tenant_id` before every seed insert" -- that
  `tests/conftest.py::_seed_one_tenant` already violates by inserting
  the tenant row before calling `set_config`).

`tenants_self_update`'s predicate right-hand side is copied VERBATIM
from `migrations/versions/0001_baseline.py:67-69`
(`NULLIF(current_setting('app.tenant_id', true), '')::uuid`); the
left-hand side here is `id`, not `tenant_id` -- `tenants` has no
`tenant_id` column, its key is `id` (design D14's stale-predicate trap,
applied to a table with a different primary key).

`tenants_read`/`tenants_insert` are deliberately as permissive as no
RLS at all (`USING (true)` / `WITH CHECK (true)`): login and the public
routes read `tenants` before any tenant context exists, and
`_seed_one_tenant` inserts before calling `set_config`. No `DELETE`
policy and no `DELETE` grant -- deletes are denied twice over.

Breaks `tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged`
on purpose (design D38): its triangulation subject moves to
`alembic_version` in the same change (`test_rls_structural.py`).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "alquileres_app"
MIGRATOR_ROLE = "alquileres_migrator"

# Right-hand side copied verbatim from
# migrations/versions/0001_baseline.py:67-69. `tenants` has no
# `tenant_id` column (its key is `id`), so the left-hand side of the
# comparison below is `id`, never `tenant_id` -- see module docstring.
_TENANT_ID_VALUE = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"


def upgrade() -> None:
    op.add_column("tenants", sa.Column("whatsapp", sa.String(20), nullable=True))
    op.create_check_constraint(
        "tenants_whatsapp_format",
        "tenants",
        "whatsapp ~ '^[0-9]{8,15}$'",
    )

    # Layer 3 -- column-scoped grant. Independent of RLS entirely.
    op.execute(f"GRANT UPDATE (whatsapp) ON tenants TO {APP_ROLE}")

    # Layer 4 -- per-command RLS. ENABLE, deliberately no FORCE (see
    # module docstring).
    op.execute("ALTER TABLE tenants ENABLE ROW LEVEL SECURITY")

    op.execute(
        f"""
        CREATE POLICY tenants_read ON tenants
          FOR SELECT TO {APP_ROLE}, {MIGRATOR_ROLE}
          USING (true)
        """
    )
    op.execute(
        f"""
        CREATE POLICY tenants_insert ON tenants
          FOR INSERT TO {APP_ROLE}, {MIGRATOR_ROLE}
          WITH CHECK (true)
        """
    )
    op.execute(
        f"""
        CREATE POLICY tenants_self_update ON tenants
          FOR UPDATE TO {APP_ROLE}, {MIGRATOR_ROLE}
          USING      (id = {_TENANT_ID_VALUE})
          WITH CHECK (id = {_TENANT_ID_VALUE})
        """
    )
    # No DELETE policy and no DELETE grant.


def downgrade() -> None:
    op.execute("DROP POLICY tenants_self_update ON tenants")
    op.execute("DROP POLICY tenants_insert ON tenants")
    op.execute("DROP POLICY tenants_read ON tenants")
    op.execute("ALTER TABLE tenants DISABLE ROW LEVEL SECURITY")
    op.drop_constraint("tenants_whatsapp_format", "tenants", type_="check")
    op.drop_column("tenants", "whatsapp")
    # The column-scoped grant dies with the column -- nothing to revoke
    # explicitly.
