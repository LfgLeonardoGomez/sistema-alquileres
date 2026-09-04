"""Rate-limit primitives (design D24) -- unit tests, no DB.

`resolve_client_address` and `SlidingWindowLimiter` are pure functions of
their inputs (a Starlette `Request`'s headers/client, or an explicit `now`)
and are exercised directly here, without booting the app or touching the
database.
"""

from starlette.requests import Request

from app.ratelimit import SlidingWindowLimiter, resolve_client_address


def _make_request(headers: dict[str, str] | None = None, client_host: str = "10.0.0.1") -> Request:
    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    scope = {"type": "http", "headers": raw_headers, "client": (client_host, 12345)}
    return Request(scope)


def test_zero_trusted_proxies_ignores_forged_x_forwarded_for() -> None:
    request = _make_request(
        headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}, client_host="203.0.113.9"
    )

    assert resolve_client_address(request, trusted_proxy_count=0) == "203.0.113.9"


def test_one_trusted_proxy_resolves_from_the_right_never_the_leftmost() -> None:
    # The leftmost entry is whatever the caller chose to send -- fully
    # forgeable. Only the rightmost entry was appended by the one trusted
    # hop, from a TCP-level connecting address it could not spoof.
    request = _make_request(headers={"X-Forwarded-For": "attacker-forged-leftmost, real-client-ip"})

    assert resolve_client_address(request, trusted_proxy_count=1) == "real-client-ip"


def test_one_trusted_proxy_falls_back_to_client_host_without_the_header() -> None:
    request = _make_request(headers={}, client_host="203.0.113.9")

    assert resolve_client_address(request, trusted_proxy_count=1) == "203.0.113.9"


def test_two_trusted_proxies_resolves_the_second_entry_from_the_right() -> None:
    # Chain: client -> P1 -> P2 -> server. P1 appends the client's real
    # address; P2 appends P1's own address (whoever connected to P2). The
    # real client ends up second-from-the-right, not last.
    request = _make_request(headers={"X-Forwarded-For": "forged, real-client-ip, proxy-1-ip"})

    assert resolve_client_address(request, trusted_proxy_count=2) == "real-client-ip"


def test_sliding_window_limiter_blocks_after_the_limit_is_reached() -> None:
    limiter = SlidingWindowLimiter(limit=3, window_seconds=60)

    for _ in range(3):
        assert limiter.check("key-a", now=1000.0).allowed

    assert limiter.check("key-a", now=1000.0).allowed is False


def test_sliding_window_limiter_frees_budget_as_timestamps_expire() -> None:
    limiter = SlidingWindowLimiter(limit=2, window_seconds=60)

    assert limiter.check("key-b", now=1000.0).allowed
    assert limiter.check("key-b", now=1010.0).allowed
    assert limiter.check("key-b", now=1020.0).allowed is False

    # The oldest attempt (t=1000) ages out of the 60s window at t=1060.
    assert limiter.check("key-b", now=1061.0).allowed is True


def test_retry_after_is_the_exact_seconds_until_the_oldest_attempt_expires() -> None:
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60)

    assert limiter.check("key-c", now=1000.0).allowed

    result = limiter.check("key-c", now=1015.0)
    assert result.allowed is False
    # Oldest attempt at t=1000 expires at t=1060; 1060 - 1015 = 45, not a
    # constant cooldown.
    assert result.retry_after_seconds == 45.0

    later_result = limiter.check("key-c", now=1050.0)
    assert later_result.allowed is False
    assert later_result.retry_after_seconds == 10.0


def test_rejected_requests_do_not_extend_their_own_window() -> None:
    """A rejected request's timestamp is never recorded -- otherwise a
    sustained attacker could keep pushing their own lockout forward
    forever by continuing to knock (design D24's sliding-window-log note)."""
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60)

    assert limiter.check("key-d", now=1000.0).allowed
    assert limiter.check("key-d", now=1010.0).allowed is False
    assert limiter.check("key-d", now=1030.0).allowed is False

    # Still governed by the ORIGINAL admitted attempt at t=1000, not by any
    # of the rejected knocks in between.
    result = limiter.check("key-d", now=1059.0)
    assert result.allowed is False
    assert result.retry_after_seconds == 1.0


def test_bounded_key_set_evicts_the_least_recently_used_key() -> None:
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60, max_keys=2)

    assert limiter.check("key-1", now=1000.0).allowed
    assert limiter.check("key-2", now=1000.0).allowed
    # A third distinct key evicts the least-recently-used one (key-1).
    assert limiter.check("key-3", now=1000.0).allowed

    # key-1's prior admitted attempt is gone -- it is treated as fresh and
    # admitted again immediately, rather than still being tracked.
    assert limiter.check("key-1", now=1000.0).allowed is True
