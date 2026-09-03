"""HTTP error mapping (design D11).

This module is the one place error responses are shaped. The initial
mapping covers the auth failure modes from slice 2: missing/invalid token
-> 401, authenticated but not permitted -> 403.

Slice 3 adds the SQLSTATE dispatch table and its `IntegrityError` handler
(registered in `app/main.py`). Dispatch on `exc.orig.sqlstate` in ONE
handler, per design D11 -- do NOT blanket-map `IntegrityError -> 409`:
`23514` (check violation) and `23503` (FK violation) mean different things
and would be misreported as conflicts.

- `23505` (unique_violation) -> 409. The `clients_tenant_phone_uq`
  conflict is normally absorbed silently by the D8 upsert
  (`upsert_or_reactivate_client`); this is the backstop for write paths
  that do NOT go through that upsert (e.g. `PATCH /clients/{id}` editing
  `phone` onto an existing value).
- `23503` (foreign_key_violation) -> 404. A composite FK
  (`(tenant_id, x_id) REFERENCES x (tenant_id, id)`, design D6) rejects a
  foreign tenant's row id on INSERT/UPDATE; from the caller's point of
  view that row does not exist, so 404 is the only honest answer (design
  D11's "cannot distinguish belongs-to-another-tenant from never-existed
  without deliberately bypassing RLS to check"). Not yet exercised by a
  Phase 3 test -- `reservations`/`payments` are the first tables to carry
  this kind of composite FK, added in later phases.
- `23P01` (exclusion_violation) -> 409, `dates_unavailable`. Added ahead
  of the `reservations` table (Phase 4) so the dispatch table is complete
  from day one; unreachable until that constraint exists.
- `23514` (check_violation) -> 422. Pydantic validation catches most of
  these first; the CHECK is the concurrency-safe backstop.

Raw driver messages are never returned to the client; only a stable
`{"detail", "code"}` shape is.
"""

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


def unauthorized(detail: str = "Missing or invalid credentials") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def forbidden(detail: str = "Not permitted") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def not_found(detail: str = "Not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


# SQLSTATE -> (HTTP status, stable machine-readable code, human detail).
_SQLSTATE_MAPPING: dict[str, tuple[int, str, str]] = {
    "23P01": (status.HTTP_409_CONFLICT, "dates_unavailable", "Dates are not available"),
    "23505": (status.HTTP_409_CONFLICT, "duplicate", "Conflicts with an existing record"),
    "23503": (status.HTTP_404_NOT_FOUND, "not_found", "Referenced record not found"),
    "23514": (status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid", "Value violates a constraint"),
}
_DEFAULT_MAPPING = (status.HTTP_500_INTERNAL_SERVER_ERROR, "internal_error", "Internal error")


def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
    sqlstate = getattr(exc.orig, "sqlstate", None)
    http_status, code, detail = _SQLSTATE_MAPPING.get(sqlstate, _DEFAULT_MAPPING)
    return JSONResponse(status_code=http_status, content={"detail": detail, "code": code})
