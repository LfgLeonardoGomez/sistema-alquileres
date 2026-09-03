"""Concurrency: the EXCLUDE constraint under a genuine race (design D6,
reservation-booking spec 'Concurrent requests for the same nights').

Two REAL threads, each driving its OWN `TestClient(app)` instance (its own
httpx client, no shared state), and therefore each request opens its OWN
`SessionLocal()` / psycopg connection via `tenant_scoped_session`
(`app/db/session.py`) -- neither thread shares a connection or a Session
object with the other. A `threading.Barrier(2)` holds both threads at the
exact same instruction so both `POST /reservations` calls are dispatched
at the same wall-clock instant, maximizing the chance their INSERT
statements are in flight on Postgres simultaneously.

This is NOT taken on faith: the test listens on `app.db.session.engine`'s
`checkout` pool event (the same engine object the running application
code uses in-process) and records the identity of every DBAPI connection
handed out during the race. If the race were actually serialized -- one
request fully finishing, returning its connection to the pool, before the
second even started -- SQLAlchemy's pool would very likely have handed
back the SAME connection object for both checkouts. Observing at least 2
DISTINCT connection identities is direct evidence that two connections
were checked out with overlapping lifetimes, i.e. a genuine concurrent
race, not two sequential requests that merely look concurrent in source
order.
"""

import threading
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import event

from app.db.session import engine as app_db_engine
from app.main import app
from tests.conftest import RegisteredOwner


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def test_concurrent_identical_booking_yields_exactly_one_201_and_one_409(
    registered_owner: RegisteredOwner,
) -> None:
    setup_client = TestClient(app)
    property_id = setup_client.post(
        "/properties", headers=registered_owner.headers, json={"name": "Race Cabin"}
    ).json()["id"]
    client_id = setup_client.post(
        "/clients",
        headers=registered_owner.headers,
        json={"full_name": "Race Guest", "phone": _unique_phone()},
    ).json()["id"]

    payload = {
        "property_id": property_id,
        "client_id": client_id,
        "check_in": "2027-06-01",
        "check_out": "2027-06-05",
        "price_total": "1000.00",
    }

    checked_out_connection_ids: set[int] = set()
    checkout_lock = threading.Lock()

    def _on_checkout(dbapi_connection, connection_record, connection_proxy) -> None:
        with checkout_lock:
            checked_out_connection_ids.add(id(dbapi_connection))

    event.listen(app_db_engine, "checkout", _on_checkout)

    barrier = threading.Barrier(2)
    responses: dict[str, int] = {}
    bodies: dict[str, dict] = {}

    def attempt(key: str) -> None:
        thread_client = TestClient(app)
        barrier.wait()  # both threads issue the HTTP call at the same instant
        response = thread_client.post(
            "/reservations", headers=registered_owner.headers, json=payload
        )
        responses[key] = response.status_code
        bodies[key] = response.json()

    try:
        t1 = threading.Thread(target=attempt, args=("a",))
        t2 = threading.Thread(target=attempt, args=("b",))
        t1.start()
        t2.start()
        t1.join(timeout=15)
        t2.join(timeout=15)
    finally:
        event.remove(app_db_engine, "checkout", _on_checkout)

    assert not t1.is_alive()
    assert not t2.is_alive()

    statuses = sorted(responses.values())
    assert statuses == [201, 409], f"expected exactly one 201 and one 409, got {responses}"

    conflict_key = next(k for k, v in responses.items() if v == 409)
    assert bodies[conflict_key]["code"] == "dates_unavailable"

    # Proof the race was genuine, not merely sequential-but-fast requests.
    assert len(checked_out_connection_ids) >= 2, (
        "expected at least 2 distinct DB connections checked out with "
        f"overlapping lifetimes, got {len(checked_out_connection_ids)} -- "
        "this would mean the requests were effectively serialized and "
        "the test proves nothing about the concurrent race"
    )
