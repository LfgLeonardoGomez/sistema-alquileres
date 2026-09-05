"""payment method

Adds `payments.payment_method`, required and not defaulted (design D41):
only the owner knows how a given amount arrived, so the API must always
supply it -- the same rule `paid_on` already follows in Python.

**The `server_default`-then-drop sequence below is required, not
decoration.** `payments` is `FORCE ROW LEVEL SECURITY` with the
`tenant_isolation` policy predicated on `app.tenant_id`
(`migrations/versions/0001_baseline.py`), which is unset inside a
migration -- an `UPDATE payments SET payment_method = 'other'` run here
would silently touch ZERO rows and report success, even though the
migrator owns the table, because that is precisely what `FORCE` does
(design D14, D45). `ADD COLUMN ... server_default` is DDL and is not
subject to RLS at all: it fills every existing row identically whether
the table is empty or populated. Never `UPDATE` inside a migration
against a `FORCE`d tenant-scoped table.

`downgrade()` drops the constraint then the column, and is LOSSY --
dropping `payment_method` destroys how every payment arrived, typed by
the owner, unrecoverable from anything else in the schema (design D45's
Rollback section). This is why `payment_method` gets its own revision,
separate from `0002_tenant_whatsapp`: their rollbacks cost different
amounts, and merging them would let the cheap rollback drag the
expensive one.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # DDL default fills every existing row without going through RLS at
    # all -- see module docstring for why an UPDATE here would not.
    op.add_column(
        "payments",
        sa.Column("payment_method", sa.String(20), nullable=False, server_default="other"),
    )
    # Drop the default immediately after: "no database default on
    # business columns" (the same property `paid_on` already has) means
    # the API, not the schema, is the only source of this value from now
    # on.
    op.alter_column("payments", "payment_method", server_default=None)
    op.create_check_constraint(
        "payments_method_valid",
        "payments",
        "payment_method IN ('cash', 'transfer', 'other')",
    )


def downgrade() -> None:
    op.drop_constraint("payments_method_valid", "payments", type_="check")
    op.drop_column("payments", "payment_method")
