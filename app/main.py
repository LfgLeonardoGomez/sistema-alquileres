"""FastAPI application entrypoint.

Importing this module constructs Settings() (see app.config), so the
process fails fast at boot if a required secret is missing.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError

from app import errors
from app.api.routers import auth, clients, dashboard, payments, properties, public, reservations
from app.config import get_settings
from app.logging import configure_logging
from app.middleware import CorrelationMiddleware

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(title="Cabin Booking API")

# Nesting order, outermost to innermost: correlation -> CORS -> routes
# (design D23's Component Map). `Starlette.add_middleware` inserts at the
# FRONT of the user-middleware list on every call, so the LAST call here
# ends up MOST outermost -- which means CORS, registered second, must be
# registered FIRST IN CODE (i.e. textually above) for CorrelationMiddleware
# to remain outermost. Verified directly against the installed Starlette
# version's `add_middleware`/`build_middleware_stack` source rather than
# assumed, since getting this backwards would silently produce the wrong
# nesting with no error at import time.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # bearer-token auth, not cookies (design D22)
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-Registration-Token", "X-Request-ID"],
    # Browser JS cannot read a response header that is not exposed -- the
    # whole point of echoing X-Request-ID would be silently defeated
    # without this (design D22).
    expose_headers=["X-Request-ID"],
)
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
