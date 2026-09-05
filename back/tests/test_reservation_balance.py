"""Derived balance (design D7, payment-tracking spec "Balance Is Derived,
Never Stored"). `balance = effective_total - paid_amount`, computed
entirely at read time -- `paid_amount` is a correlated SQL
`column_property` (`app/models/reservation.py`), `balance` is a Pydantic
`computed_field` (`app/schemas/reservation.py`). Neither is a stored
column.

Payment rows are inserted directly via `migrator_engine` in this file,
NOT through `POST /reservations/{id}/payments` -- that endpoint does not
exist until task 5.7. This is deliberate: `balance` is purely a read-side
concern over whatever rows already exist in `payments`, so it is testable
independently of the write path that creates them.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy import text

from app.main import app
from app.services.reservations import balance
from tests.conftest import RegisteredOwner

client = TestClient(app)


# ---- unit: the pure function, no DB (Testing Strategy: "balance() returns 0
# for cancelled at several paid amounts, and total - paid otherwise,
# including a negative (overpaid) result") ----


def test_balance_pure_function_cancelled_with_no_payment_is_zero() -> None:
    assert balance(
        status="cancelled", effective_total=Decimal("180000"), paid_amount=Decimal("0")
    ) == Decimal("0")


def test_balance_pure_function_cancelled_with_partial_payment_is_zero() -> None:
    assert balance(
        status="cancelled", effective_total=Decimal("180000"), paid_amount=Decimal("60000")
    ) == Decimal("0")


def test_balance_pure_function_cancelled_overpaid_is_still_zero() -> None:
    """A cancelled reservation's balance is never negative -- it does not
    assert the business owes money back (design D44)."""
    assert balance(
        status="cancelled", effective_total=Decimal("180000"), paid_amount=Decimal("200000")
    ) == Decimal("0")


def test_balance_pure_function_non_cancelled_is_total_minus_paid() -> None:
    assert balance(
        status="reserved", effective_total=Decimal("5000"), paid_amount=Decimal("2000")
    ) == Decimal("3000")


def test_balance_pure_function_non_cancelled_overpaid_is_negative() -> None:
    assert balance(
        status="reserved", effective_total=Decimal("500"), paid_amount=Decimal("800")
    ) == Decimal("-300")


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_reservation(owner: RegisteredOwner, price_total: str) -> dict:
    property_id = client.post(
        "/properties", headers=owner.headers, json={"name": "Balance Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=owner.headers,
        json={"full_name": "Balance Guest", "phone": _unique_phone()},
    ).json()["id"]
    return client.post(
        "/reservations",
        headers=owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-05-01",
            "check_out": "2026-05-06",
            "price_total": price_total,
        },
    ).json()


def _insert_payment_row(
    migrator_engine: Engine, *, tenant_id: uuid.UUID, reservation_id: str, amount: str
) -> None:
    with migrator_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": str(tenant_id)}
        )
        conn.execute(
            text(
                "INSERT INTO payments (id, tenant_id, reservation_id, amount, paid_on) "
                "VALUES (:id, :tid, :rid, :amount, :paid_on)"
            ),
            {
                "id": uuid.uuid4(),
                "tid": tenant_id,
                "rid": reservation_id,
                "amount": amount,
                "paid_on": "2026-05-01",
            },
        )


def test_balance_with_no_payments_equals_the_full_total(
    registered_owner: RegisteredOwner,
) -> None:
    reservation = _create_reservation(registered_owner, "5000.00")

    response = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert response.status_code == 200
    assert Decimal(str(response.json()["balance"])) == Decimal("5000.00")


def test_balance_reflects_a_partial_payment(
    registered_owner: RegisteredOwner, migrator_engine: Engine
) -> None:
    reservation = _create_reservation(registered_owner, "5000.00")
    _insert_payment_row(
        migrator_engine,
        tenant_id=registered_owner.tenant_id,
        reservation_id=reservation["id"],
        amount="2000.00",
    )

    response = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert response.status_code == 200
    assert Decimal(str(response.json()["balance"])) == Decimal("3000.00")


def test_balance_updates_after_multiple_payments(
    registered_owner: RegisteredOwner, migrator_engine: Engine
) -> None:
    """Triangulation: more than one payment must accumulate, not just
    overwrite -- a bug that only summed the latest row would still pass
    the single-payment case above."""
    reservation = _create_reservation(registered_owner, "6000.00")
    for amount in ("2000.00", "2000.00", "1000.00"):
        _insert_payment_row(
            migrator_engine,
            tenant_id=registered_owner.tenant_id,
            reservation_id=reservation["id"],
            amount=amount,
        )

    response = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert response.status_code == 200
    assert Decimal(str(response.json()["balance"])) == Decimal("1000.00")


def test_a_refund_increases_balance_back(
    registered_owner: RegisteredOwner, migrator_engine: Engine
) -> None:
    """A negative-amount row (a refund) must reduce paid_amount, which
    increases the derived balance back -- there is no separate refund
    code path, the sign alone does the work (design D7)."""
    reservation = _create_reservation(registered_owner, "5000.00")
    _insert_payment_row(
        migrator_engine,
        tenant_id=registered_owner.tenant_id,
        reservation_id=reservation["id"],
        amount="2000.00",
    )
    _insert_payment_row(
        migrator_engine,
        tenant_id=registered_owner.tenant_id,
        reservation_id=reservation["id"],
        amount="-2000.00",
    )

    response = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert response.status_code == 200
    assert Decimal(str(response.json()["balance"])) == Decimal("5000.00")


def test_cancelled_reservation_balance_is_zero_regardless_of_payments(
    registered_owner: RegisteredOwner, migrator_engine: Engine
) -> None:
    """payment-tracking spec, "A cancelled reservation's balance is zero
    regardless of payments" -- a cancelled $180.000 stay carrying a
    $60.000 deposit must report `balance == 0`, not `120000` (design D44)."""
    reservation = _create_reservation(registered_owner, "180000.00")
    _insert_payment_row(
        migrator_engine,
        tenant_id=registered_owner.tenant_id,
        reservation_id=reservation["id"],
        amount="60000.00",
    )

    cancel_response = client.post(
        f"/reservations/{reservation['id']}/cancel", headers=registered_owner.headers
    )
    assert cancel_response.status_code == 200

    response = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert response.status_code == 200
    body = response.json()
    assert Decimal(str(body["balance"])) == Decimal("0")
    assert body["status"] == "cancelled"


def test_cancelled_reservation_keeps_paid_amount_visible(
    registered_owner: RegisteredOwner, migrator_engine: Engine
) -> None:
    """payment-tracking spec, "A cancelled reservation's payments remain
    visible" -- cancellation collapses the derived `balance`, not the
    payment history: `paid_amount` and the individual payment row stay
    readable even though `balance` reads `0` (design D44)."""
    reservation = _create_reservation(registered_owner, "180000.00")
    _insert_payment_row(
        migrator_engine,
        tenant_id=registered_owner.tenant_id,
        reservation_id=reservation["id"],
        amount="60000.00",
    )
    client.post(f"/reservations/{reservation['id']}/cancel", headers=registered_owner.headers)

    response = client.get(f"/reservations/{reservation['id']}", headers=registered_owner.headers)
    assert response.status_code == 200
    body = response.json()
    assert Decimal(str(body["balance"])) == Decimal("0")
    assert Decimal(str(body["paid_amount"])) == Decimal("60000.00")
    assert Decimal(str(body["effective_total"])) == Decimal("180000.00")

    payments_response = client.get(
        f"/reservations/{reservation['id']}/payments", headers=registered_owner.headers
    )
    assert payments_response.status_code == 200
    amounts = [Decimal(str(p["amount"])) for p in payments_response.json()]
    assert Decimal("60000.00") in amounts


def test_price_can_be_edited_below_the_amount_already_paid(
    registered_owner: RegisteredOwner,
) -> None:
    """reservation-booking spec, "Editing price below amount already paid is
    allowed".

    The owner is the only user of this system and is reconciling reality, not
    being policed by it. A guest may genuinely have overpaid, or the owner may
    have entered the wrong figure and be correcting it downward after a deposit
    already landed. Blocking the edit would leave the wrong number stored
    forever with no way to fix it.

    The overpayment surfaces as a NEGATIVE balance rather than being clamped at
    zero -- that is the signal the owner owes money back, and hiding it would
    lose real information.
    """
    reservation = _create_reservation(registered_owner, "1000.00")
    reservation_id = reservation["id"]

    payment = client.post(
        f"/reservations/{reservation_id}/payments",
        headers=registered_owner.headers,
        json={"amount": "800.00"},
    )
    assert payment.status_code == 201, payment.text

    lowered = client.patch(
        f"/reservations/{reservation_id}",
        headers=registered_owner.headers,
        json={"price_total": "500.00"},
    )

    assert lowered.status_code == 200, lowered.text
    body = lowered.json()
    assert Decimal(body["effective_total"]) == Decimal("500.00")
    assert Decimal(body["paid_amount"]) == Decimal("800.00")
    assert Decimal(body["balance"]) == Decimal("-300.00")
