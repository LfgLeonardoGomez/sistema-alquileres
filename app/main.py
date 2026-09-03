"""FastAPI application entrypoint.

Importing this module constructs Settings() (see app.config), so the
process fails fast at boot if a required secret is missing.
"""

from fastapi import FastAPI
from sqlalchemy.exc import IntegrityError

from app import errors
from app.api.routers import auth, clients, payments, properties, reservations
from app.config import get_settings

settings = get_settings()

app = FastAPI(title="Cabin Booking API")

app.include_router(auth.router)
app.include_router(properties.router)
app.include_router(clients.router)
app.include_router(reservations.router)
app.include_router(payments.router)

app.add_exception_handler(IntegrityError, errors.handle_integrity_error)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
