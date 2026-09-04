"""FastAPI application entrypoint.

Importing this module constructs Settings() (see app.config), so the
process fails fast at boot if a required secret is missing.
"""

from fastapi import FastAPI
from sqlalchemy.exc import IntegrityError

from app import errors
from app.api.routers import auth, clients, dashboard, payments, properties, public, reservations
from app.config import get_settings
from app.logging import configure_logging
from app.middleware import CorrelationMiddleware

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title="Cabin Booking API")

# Registered outermost (design D23's Component Map: correlation -> CORS ->
# routes) -- `add_middleware` inserts at the front of Starlette's user
# middleware list, so the LAST call here ends up outermost. This is the
# only middleware registered so far; CORS is added in Phase 4, and must be
# added AFTER this call to stay inside it.
app.add_middleware(CorrelationMiddleware)

app.include_router(auth.router)
app.include_router(properties.router)
app.include_router(clients.router)
app.include_router(reservations.router)
app.include_router(payments.router)
app.include_router(dashboard.router)
app.include_router(public.router)

app.add_exception_handler(IntegrityError, errors.handle_integrity_error)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
