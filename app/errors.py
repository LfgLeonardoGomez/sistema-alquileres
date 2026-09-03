"""HTTP error mapping (design D11).

This module is the one place error responses are shaped. The initial
mapping below covers the auth failure modes introduced in this slice:
missing/invalid token -> 401, authenticated but not permitted -> 403.
SQLSTATE dispatch (`23P01` -> 409, `23505` -> 409, `23503` -> 404, etc.)
is added as each constraint that needs it ships, in later slices.

Raw driver messages are never returned to the client; only a stable
`{"detail"}` shape is. This module's helpers are the single place that
raises these responses so routes and dependencies stay consistent.
"""

from fastapi import HTTPException, status


def unauthorized(detail: str = "Missing or invalid credentials") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def forbidden(detail: str = "Not permitted") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def not_found(detail: str = "Not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
