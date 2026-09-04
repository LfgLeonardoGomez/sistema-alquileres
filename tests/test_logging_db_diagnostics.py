"""Database diagnostics redaction (design D23, Layer 3; request-logging
spec's "Database Diagnostics Exclude Driver Detail Text").

Forces the real `23505` on `clients_tenant_phone_uq` via `PATCH
/clients/{id}` (see `tests/test_clients.py`'s `test_patch_client_phone_to_
existing_phone_returns_409` for why `PATCH` is the write path that
surfaces this as a raw constraint violation rather than the silent D8
upsert). The conflicting phone number is deliberately distinctive so a
false negative (the assertion passing only because the phone number
happens to be a common substring of something else) is not plausible.
"""

import logging
import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _distinctive_phone() -> str:
    return f"+549555{uuid.uuid4().hex[:9]}"


def test_duplicate_phone_conflict_logs_sqlstate_and_constraint_not_phone(
    registered_owner: RegisteredOwner, caplog
) -> None:
    headers = registered_owner.headers
    taken_phone = _distinctive_phone()
    client.post(
        "/clients", headers=headers, json={"full_name": "Owns The Phone", "phone": taken_phone}
    )
    victim = client.post(
        "/clients",
        headers=headers,
        json={"full_name": "Wants The Phone", "phone": _distinctive_phone()},
    ).json()

    with caplog.at_level(logging.INFO):
        response = client.patch(
            f"/clients/{victim['id']}", headers=headers, json={"phone": taken_phone}
        )

    assert response.status_code == 409

    diagnostic_records = [
        record for record in caplog.records if getattr(record, "sqlstate", None) is not None
    ]
    assert diagnostic_records, "expected a log line carrying the SQLSTATE"
    matching = [
        record
        for record in diagnostic_records
        if record.sqlstate == "23505" and getattr(record, "constraint", None) == "clients_tenant_phone_uq"
    ]
    assert matching, f"expected sqlstate=23505/constraint=clients_tenant_phone_uq, got {diagnostic_records}"

    for record in caplog.records:
        assert taken_phone not in record.getMessage()
        assert taken_phone not in str(record.args)
        assert taken_phone not in str(vars(record))
