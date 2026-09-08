"""tenant slug format

Adds a CHECK constraint asserting the exact same shape
`RegisterRequest.tenant_slug`'s validator (`app/schemas/auth.py`) produces
after normalisation (design D11: Pydantic first, the CHECK as the
concurrent-safe backstop) -- the same house pattern `0002_tenant_whatsapp`
already established for `whatsapp`.

Lowercase letters, digits, and hyphens; no leading/trailing/consecutive
hyphen; 3 to 63 characters (see `app/schemas/auth.py` for the length
rationale). No RLS or grant changes needed: `tenants` already carries the
`tenants_read`/`tenants_insert` policies and the app role's `SELECT,
INSERT` grant from `0001_baseline`/`0002_tenant_whatsapp` -- a CHECK
constraint is enforced independently of both.

Verified against the live `db` database before writing this migration
(queried directly, not assumed): both current tenants (`demo`, 4 chars;
`aya`, 3 chars) and every other row already in `tenants` satisfy this
shape. This migration cannot fail on existing data.

`downgrade()` is cheap and lossless: dropping the CHECK does not touch any
data, unlike `0003_payment_method`'s lossy column drop.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-08

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrored verbatim in app/models/tenant.py's __table_args__ -- Pydantic
# output and this CHECK must assert the same shape, or the pattern
# produces rows the app can read but never write again.
_SLUG_FORMAT_SQL = "char_length(slug) BETWEEN 3 AND 63 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'"


def upgrade() -> None:
    op.create_check_constraint("tenants_slug_format", "tenants", _SLUG_FORMAT_SQL)


def downgrade() -> None:
    op.drop_constraint("tenants_slug_format", "tenants", type_="check")
