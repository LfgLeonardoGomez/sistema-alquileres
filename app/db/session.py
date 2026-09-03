"""Engine + session factory for the API process (alquileres_app role).

`tenant_scoped_session` is the low-level primitive behind design D4's tenant
context: it opens one transaction, sets `app.tenant_id` transaction-locally
via a bound parameter (never string interpolation), yields the session, and
commits or rolls back on exit -- which means the setting's lifetime *is*
the transaction and it can never leak back into a pooled connection.

The FastAPI-wired dependency (`get_tenant_session` / `TenantSessionDep`,
which resolves `tenant_id` from the verified JWT via `PrincipalDep`) lives
in `app/api/deps.py`, added once that module exists (design D4).
"""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@contextmanager
def tenant_scoped_session(tenant_id: uuid.UUID) -> Iterator[Session]:
    """Open a transaction scoped to `tenant_id` (design D4).

    Uses `set_config('app.tenant_id', :tid, true)` with a bound parameter --
    `SET LOCAL` cannot take a bind parameter, and string-interpolating a
    tenant id into SQL is how injection happens. The `true` argument makes
    the setting transaction-local: it does not survive COMMIT or ROLLBACK,
    so a connection returned to the pool can never carry it forward.
    """
    with SessionLocal() as session, session.begin():
        session.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        yield session
