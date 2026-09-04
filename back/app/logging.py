"""Structured JSON logging (design D23).

**Layer 1 -- the formatter emits an allowlist, not a denylist.** `JsonFormatter`
renders exactly the fields in `_ALLOWED_FIELDS`, read off `record.__dict__`
(populated by a caller's `extra={...}` argument, never by the positional
`msg`/`args` a caller passed to `logger.info(...)` etc.). **A field that is
not on the allowlist is dropped, not redacted** -- there is no "denylist of
things to strip" for this formatter to fall behind. In particular, the log
call's own message text is never rendered: every call site must describe
what happened via `extra={"event": ...}` plus allowlisted fields, not via a
human-readable message string.

**Layer 2 -- no exception text, ever.** `exc_info` renders as
`{"type": "...", "frames": [...]}` -- never the exception's `str()`,
`repr()`, or `args`. This holds even if a call site does something the
design explicitly forbids, like `logger.exception(str(exc))`: since the
formatter never touches `record.getMessage()`, the message text is dropped
structurally, not by caller discipline.

**Layer 3 -- `describe_db_error` is the only sanctioned accessor for driver
diagnostics.** It returns exactly `{"sqlstate", "constraint", "table"}` from
psycopg's `Diagnostic`, and never reads `message_detail`/`message_primary`
(the fields that carry the offending row's key/value text).

**Layer 4 -- `sqlalchemy.engine` is pinned to WARNING**, independently of
the root level, so raising `LOG_LEVEL=DEBUG` for an unrelated problem does
not turn on SQL bound-parameter logging (password hashes, phone numbers,
emails) as a side effect.

## The contextvar gotcha

This application is sync by design: FastAPI runs path operations and their
sync dependencies in a threadpool via `run_in_threadpool`, which executes
them in a **copy** of the current `contextvars.Context`. A `ContextVar`
*rebound* (`_context_var.set(new_dict)`) inside that copy is invisible to
the middleware that set it up, because `copy_context()` copies *bindings*,
not the objects they point to.

The working version: the contextvar holds a **mutable dict**, set fresh
(once) by `CorrelationMiddleware` via `new_context()`, and **mutated in
place** everywhere else (`get_context()[...] = ...`, never
`get_context = {...}`). Because `copy_context()` copies the binding, the
dict object the middleware holds and the dict object a dependency mutates
are the same object -- mutations are visible everywhere.
The broken version differs by one character: `get_context()` returning a
*new* dict and rebinding the contextvar to it would silently make
`tenant_id`/`user_id` `null` on every log line, forever, because the
middleware's own copy of the contextvar would never see the rebind.

Deviation from task 3.7's literal wording: correlation fields are attached
via `logging.setLogRecordFactory`, not a `logging.Filter` on the root
handler. This was tried first and does not work: `Logger.filter()` (where
a `logging.Filter` attached to a *logger* -- as opposed to a *handler* --
would run) is only invoked on the logger a call was made directly on
(`Logger.handle()`), never on an ancestor logger during propagation --
`Logger.callHandlers()` walks up the hierarchy invoking each ancestor's
*handlers*, but not each ancestor's own `.filter()`. A `logging.Filter`
attached to the root logger therefore silently never runs for any record
that reaches root by propagating up from a named child logger (`"app.
request"`, `"sqlalchemy.engine"`, ...), which is every record this
application emits. `setLogRecordFactory` instead wraps record *creation*
itself, before any propagation or handler dispatch, so every handler that
ever sees the record -- our own `StreamHandler`, and a test harness's
capture handler alike -- sees the same enriched attributes unconditionally.
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
import traceback
from datetime import UTC, datetime
from typing import Any

# Base fields always considered for output, populated on the record either
# by a caller's `extra={...}` or by `_ContextFilter` below. Missing (None)
# fields are omitted from the rendered line rather than emitted as null,
# so a plain non-request log line does not carry a forest of empty keys.
_ALLOWED_FIELDS: frozenset[str] = frozenset(
    {
        "event",
        "request_id",
        "method",
        "path",
        "status",
        "duration_ms",
        "tenant_id",
        "user_id",
        # Layer 3 -- the only extra keys `describe_db_error` is allowed to
        # produce. Anything else a caller puts in `extra=` is dropped.
        "sqlstate",
        "constraint",
        "table",
        # design D24 -- the resolved rate-limit strategy at boot, and the
        # resolved key on the first 429 in a process. Never the raw
        # request body or credentials; `client_key` is the same address
        # `resolve_client_address` computed, nothing else.
        "trusted_proxy_count",
        "client_key",
    }
)


class JsonFormatter(logging.Formatter):
    """Renders exactly the allowlisted fields as one JSON line. Never
    renders `record.getMessage()`, `record.args`, or an exception's
    `str()`/`repr()` (design D23, Layers 1-2)."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }
        for field in _ALLOWED_FIELDS:
            value = record.__dict__.get(field)
            if value is not None:
                payload[field] = value

        if record.exc_info:
            exc_type = record.exc_info[0]
            payload["exc_info"] = {
                "type": exc_type.__name__ if exc_type is not None else None,
                "frames": [
                    {"file": frame.filename, "line": frame.lineno, "function": frame.name}
                    for frame in traceback.extract_tb(record.exc_info[2])
                ],
            }

        return json.dumps(payload, default=str)


# The correlation context: a single mutable dict per request, held by a
# ContextVar. See the module docstring's "contextvar gotcha" section --
# mutate in place, never rebind.
_context_var: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar("log_context")


def new_context() -> dict[str, Any]:
    """Bind a fresh, empty context dict for the current execution context
    (called once per request, by `CorrelationMiddleware`) and return it."""
    ctx: dict[str, Any] = {}
    _context_var.set(ctx)
    return ctx


def get_context() -> dict[str, Any]:
    """Return the current request's context dict, or an empty dict outside
    any request (e.g. during app startup or a test fixture's own setup)."""
    try:
        return _context_var.get()
    except LookupError:
        return {}


_original_record_factory = logging.getLogRecordFactory()


def _record_factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
    """Attaches `request_id`/`tenant_id`/`user_id` from the current
    correlation context to every record at creation time -- including
    SQLAlchemy's and uvicorn's, since every logger eventually constructs
    its records through this same global factory (design D23)."""
    record = _original_record_factory(*args, **kwargs)
    ctx = get_context()
    record.request_id = ctx.get("request_id")
    record.tenant_id = ctx.get("tenant_id")
    record.user_id = ctx.get("user_id")
    return record


_configured = False


def configure_logging(level: str) -> None:
    """Wire the root logger to emit `JsonFormatter` lines to stdout, and
    pin `sqlalchemy.engine` to WARNING independently of `level` (Layer 4).
    Idempotent -- safe to call more than once (e.g. across test imports)."""
    global _configured

    root = logging.getLogger()
    root.setLevel(level.upper())

    if not _configured:
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.setFormatter(JsonFormatter())
        root.addHandler(handler)
        logging.setLogRecordFactory(_record_factory)
        _configured = True

    # Layer 4: SQLAlchemy logs SQL at INFO and bound parameters at DEBUG.
    # Without this pin, LOG_LEVEL=DEBUG for an unrelated problem silently
    # turns on full parameter logging -- password hashes, phone numbers,
    # emails -- as a side effect.
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def describe_db_error(exc: Exception) -> dict[str, str | None]:
    """The only sanctioned accessor for a DBAPI error's loggable detail
    (design D23, Layer 3). Returns exactly `{"sqlstate", "constraint",
    "table"}` from psycopg's `Diagnostic` -- never `message_detail` or
    `message_primary`, the fields that carry the offending row's data."""
    diag = getattr(getattr(exc, "orig", None), "diag", None)
    return {
        "sqlstate": getattr(diag, "sqlstate", None),
        "constraint": getattr(diag, "constraint_name", None),
        "table": getattr(diag, "table_name", None),
    }
