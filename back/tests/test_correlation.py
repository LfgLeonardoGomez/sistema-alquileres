"""Correlation identifier propagation (design D23).

`X-Request-ID` is generated when absent or invalid, reused when present and
valid, echoed on every normal response, and attached to every log line
emitted while handling the request.

A dedicated `/__test/crash` route is registered on the shared `app` object
so the "forced 500" scenario can be exercised without any real business
logic raising by accident. It is added here, in the test module, rather
than in `app.main` -- production code carries no test-only surface.
"""

import logging
import re

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_UUID4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE
)


@app.get("/__test/crash")
def _crash() -> None:
    raise RuntimeError("boom -- forced for test_correlation.py")


def test_response_without_inbound_header_gets_a_generated_request_id() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    request_id = response.headers.get("X-Request-ID")
    assert request_id is not None
    assert _UUID4_RE.match(request_id)


def test_valid_inbound_request_id_is_reused() -> None:
    response = client.get("/health", headers={"X-Request-ID": "caller-supplied-id-123"})
    assert response.headers.get("X-Request-ID") == "caller-supplied-id-123"


def test_invalid_inbound_request_id_is_discarded_and_replaced() -> None:
    # Contains a newline -- the exact injection this validation exists to
    # stop (design D23: a newline in it forges log entries).
    response = client.get("/health", headers={"X-Request-ID": "bad\nid"})
    request_id = response.headers.get("X-Request-ID")
    assert request_id is not None
    assert request_id != "bad\nid"
    assert _UUID4_RE.match(request_id)


def test_every_log_line_for_a_request_carries_the_same_request_id(caplog) -> None:
    with caplog.at_level(logging.INFO):
        response = client.get("/health", headers={"X-Request-ID": "shared-id-for-this-test"})

    assert response.headers.get("X-Request-ID") == "shared-id-for-this-test"
    request_records = [r for r in caplog.records if getattr(r, "request_id", None) is not None]
    assert request_records, "expected at least one log line carrying a request_id"
    for record in request_records:
        assert record.request_id == "shared-id-for-this-test"


def test_forced_500_still_emits_a_log_line_with_the_request_id(caplog) -> None:
    # TestClient re-raises server exceptions by default; disable that here
    # so the assertion can inspect the actual 500 response, the same way a
    # real deployed server would return one.
    non_raising_client = TestClient(app, raise_server_exceptions=False)

    with caplog.at_level(logging.INFO):
        response = non_raising_client.get(
            "/__test/crash", headers={"X-Request-ID": "crash-id-for-this-test"}
        )

    assert response.status_code == 500
    matching = [
        record
        for record in caplog.records
        if getattr(record, "request_id", None) == "crash-id-for-this-test"
        and getattr(record, "status", None) == 500
    ]
    assert matching, "expected a status=500 log line carrying the forced request id"
