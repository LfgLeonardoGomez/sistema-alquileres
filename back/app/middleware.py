"""`CorrelationMiddleware` (design D23).

Registered outermost (see `app/main.py`) so it wraps CORS and every route,
including a future `429` (design D24) -- and so a CORS preflight that gets
rejected, which surfaces to a browser as an opaque network error, still
produces a log line on this side.

Never calls `request.body()` (design D23, Layer 5): a `POST /auth/login`
body carries a plaintext password, and a `POST /auth/register` body
travels with a deployment secret in a header.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.logging import new_context

logger = logging.getLogger("app.request")

# Attacker-controlled if reused verbatim: a newline in it forges log
# entries, and in a JSON-lines stream it breaks line framing outright.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _resolve_request_id(inbound: str | None) -> str:
    if inbound is not None and _REQUEST_ID_RE.match(inbound):
        return inbound
    return str(uuid.uuid4())


class CorrelationMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = _resolve_request_id(request.headers.get("x-request-id"))

        ctx = new_context()
        ctx["request_id"] = request_id

        path = request.url.path  # query string deliberately excluded (D23)
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.error(
                "",
                extra={
                    "event": "request",
                    "method": request.method,
                    "path": path,
                    "status": 500,
                    "duration_ms": duration_ms,
                },
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "",
            extra={
                "event": "request",
                "method": request.method,
                "path": path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response
