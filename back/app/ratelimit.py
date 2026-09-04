"""Rate limiting for `POST /auth/login` and `POST /auth/register` (design D24).

**The counter never learns the outcome.** Every request to the endpoint is
counted before the handler runs -- login success/failure, registration
success/failure, even a malformed body -- because the moment the limiter's
state depends on the outcome, the `429` boundary becomes an
account-existence oracle. Design D10 removed that oracle by making every
failed login return one identical `401`; a limiter that only counts
failures, or that locks the *account* rather than the *caller*, hands the
oracle straight back.

**Key: the client address alone.** Never address + tenant slug, and never
slug alone -- with one owner per tenant and a public `tenant_slug`, any
slug-inclusive key is a remote lockout button for a known tenant (send N
bad logins for a slug read off a public calendar URL and the real owner is
locked out of their own system).

**Client address resolution respects `TRUSTED_PROXY_COUNT`.** With no
trusted proxies (`0`), `X-Forwarded-For` is never read at all -- on a
direct connection it is entirely attacker-controlled, and trusting it
would let an attacker forge a fresh address on every request and evade the
limiter permanently. With `N` trusted proxies, the real client's address
is the Nth entry from the RIGHT of the header (never the leftmost, which
is attacker-supplied): each trusted hop appends the address of whoever
connected to it directly, so only the last `N` entries were written by
infrastructure this deployment trusts -- anything further left, including
the very first entry, is whatever the original caller chose to send.

**Sliding-window log, not a fixed bucket.** Each key holds the timestamps
of its *admitted* requests within the current window. A request is
admitted if fewer than the limit remain inside the window; on admission
its timestamp is appended. A rejected request's timestamp is *not*
recorded, so `Retry-After` counts down to the moment the oldest recorded
timestamp ages out of the window -- not a fixed cooldown -- and a
sustained attacker cannot keep pushing their own lockout forward by
continuing to knock.

**Bounded key set.** An attacker rotating source addresses could otherwise
grow the in-process key set without limit -- a rate limiter that is itself
a memory-exhaustion vector. Each limiter keeps at most `max_keys` entries,
evicting the least-recently-used key.

**`threading.Lock`-guarded.** Sync path operations and their dependencies
run in FastAPI's threadpool -- an unguarded counter is quietly wrong under
concurrent load, not obviously broken.

**Why in-process state is safe here, not a distributed store:** the
production image's `CMD` pins `--workers 1` (design D19) specifically
because this limiter's correctness depends on every request reaching a
process that shares the same counters; a second worker process would each
keep its own independent budget, silently doubling the effective limit.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Final

from fastapi import HTTPException, Request, status

from app.config import get_settings

logger = logging.getLogger("app.ratelimit")

# Budgets (design D24) -- owner-approved 2026-09-04 as a revisable starting
# point. The SHAPE above (outcome-blind, address-only) is load-bearing;
# these NUMBERS are cheap to change later.
LOGIN_LIMIT: Final[int] = 10
LOGIN_WINDOW_SECONDS: Final[float] = 15 * 60
REGISTER_LIMIT: Final[int] = 5
REGISTER_WINDOW_SECONDS: Final[float] = 60 * 60

_MAX_KEYS: Final[int] = 10_000


def resolve_client_address(request: Request, trusted_proxy_count: int) -> str:
    """The rate-limit key. See the module docstring for the full argument;
    in short: `trusted_proxy_count == 0` never reads `X-Forwarded-For` and
    uses the TCP-level `request.client.host`; otherwise the real client is
    the `trusted_proxy_count`-th entry from the RIGHT of the header."""
    if trusted_proxy_count > 0:
        header = request.headers.get("x-forwarded-for")
        if header:
            entries = [entry.strip() for entry in header.split(",") if entry.strip()]
            if len(entries) >= trusted_proxy_count:
                return entries[-trusted_proxy_count]
    client = request.client
    return client.host if client is not None else "unknown"


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after_seconds: float


class SlidingWindowLimiter:
    """One sliding-window log per key. `check()` is the only entry point:
    it prunes expired timestamps, admits (and records) the request if the
    remaining count is under `limit`, and otherwise rejects without
    recording -- so a rejected request never extends its own lockout."""

    def __init__(self, limit: int, window_seconds: float, max_keys: int = _MAX_KEYS) -> None:
        self._limit = limit
        self._window_seconds = window_seconds
        self._max_keys = max_keys
        self._lock = threading.Lock()
        # Insertion/access order doubles as LRU order (moved to the end on
        # every touch), so the oldest untouched key is always at the front.
        self._log: OrderedDict[str, list[float]] = OrderedDict()

    def check(self, key: str, *, now: float | None = None) -> RateLimitResult:
        moment = time.monotonic() if now is None else now
        cutoff = moment - self._window_seconds

        with self._lock:
            timestamps = [t for t in self._log.get(key, []) if t > cutoff]

            if len(timestamps) >= self._limit:
                self._log[key] = timestamps
                self._log.move_to_end(key)
                retry_after = timestamps[0] + self._window_seconds - moment
                return RateLimitResult(allowed=False, retry_after_seconds=max(retry_after, 0.0))

            timestamps.append(moment)
            self._log[key] = timestamps
            self._log.move_to_end(key)
            while len(self._log) > self._max_keys:
                self._log.popitem(last=False)
            return RateLimitResult(allowed=True, retry_after_seconds=0.0)


_login_limiter = SlidingWindowLimiter(LOGIN_LIMIT, LOGIN_WINDOW_SECONDS)
_register_limiter = SlidingWindowLimiter(REGISTER_LIMIT, REGISTER_WINDOW_SECONDS)

_first_429_logged = False
_first_429_lock = threading.Lock()


def _log_first_429(event: str, key: str) -> None:
    """Logs the resolved rate-limit key on the FIRST `429` raised in this
    process only -- an incident is visible in the log the moment it
    starts, without flooding it for the remainder of a sustained attack."""
    global _first_429_logged
    with _first_429_lock:
        if _first_429_logged:
            return
        _first_429_logged = True
    logger.warning("", extra={"event": event, "client_key": key})


def _enforce(request: Request, limiter: SlidingWindowLimiter, event: str) -> None:
    settings = get_settings()
    key = resolve_client_address(request, settings.trusted_proxy_count)
    result = limiter.check(key)
    if not result.allowed:
        _log_first_429(event, key)
        retry_after = max(1, math.ceil(result.retry_after_seconds))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def enforce_login_rate_limit(request: Request) -> None:
    """Route-level dependency (design D24) -- attached to `POST
    /auth/login`'s route object rather than middleware, so it cannot drift
    from the router the way a path-matching middleware could. Runs before
    the handler has looked anything up: it never learns the outcome of the
    login it is gating."""
    _enforce(request, _login_limiter, "login_rate_limited")


def enforce_register_rate_limit(request: Request) -> None:
    """Same as `enforce_login_rate_limit`, for `POST /auth/register`."""
    _enforce(request, _register_limiter, "register_rate_limited")


def log_rate_limit_strategy() -> None:
    """Called once at boot (`app/main.py`) so the resolved
    `TRUSTED_PROXY_COUNT` is visible in the log rather than discovered
    during an incident (design D24)."""
    settings = get_settings()
    logger.info(
        "",
        extra={
            "event": "ratelimit_strategy",
            "trusted_proxy_count": settings.trusted_proxy_count,
        },
    )
