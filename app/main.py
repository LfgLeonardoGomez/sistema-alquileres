"""FastAPI application entrypoint.

Importing this module constructs Settings() (see app.config), so the
process fails fast at boot if a required secret is missing.
"""

from fastapi import FastAPI

from app.config import get_settings

settings = get_settings()

app = FastAPI(title="Cabin Booking API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
