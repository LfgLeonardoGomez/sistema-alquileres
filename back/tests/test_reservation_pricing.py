"""Pricing resolution (design D7, reservation-booking spec 'Pricing Is
Stored As Entered, Total Is Derived'). `effective_total` MUST NOT be a
stored column -- it is a `computed_field` recomputed from whichever field
was actually stored, every time it is read.
"""

import uuid
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.services.reservations import effective_total
from tests.conftest import RegisteredOwner

client = TestClient(app)


def _unique_phone() -> str:
    return f"+549{uuid.uuid4().int % 10**10:010d}"


def _create_property(owner: RegisteredOwner, name: str) -> str:
    return client.post("/properties", headers=owner.headers, json={"name": name}).json()["id"]


def _create_client(owner: RegisteredOwner, full_name: str) -> str:
    return client.post(
        "/clients", headers=owner.headers, json={"full_name": full_name, "phone": _unique_phone()}
    ).json()["id"]


# ---- unit: the pure function, no DB (Testing Strategy: "Pricing resolution... Pure functions, no DB") ----


def test_effective_total_pure_function_per_night() -> None:
    from datetime import date

    total = effective_total(
        price_per_night=Decimal("1000.00"),
        price_total=None,
        check_in=date(2026, 1, 1),
        check_out=date(2026, 1, 6),
    )
    assert total == Decimal("5000.00")


def test_effective_total_pure_function_stay_total_ignores_nights() -> None:
    from datetime import date

    total = effective_total(
        price_per_night=None,
        price_total=Decimal("5000.00"),
        check_in=date(2026, 1, 1),
        check_out=date(2026, 1, 6),
    )
    assert total == Decimal("5000.00")


# ---- integration: through the real API ----


def test_per_night_pricing_computes_total_as_rate_times_nights(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Per Night Cabin")
    client_id = _create_client(registered_owner, "Per Night Guest")

    response = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-02-01",
            "check_out": "2026-02-06",  # 5 nights
            "price_per_night": "1000.00",
        },
    )
    assert response.status_code == 201
    assert Decimal(str(response.json()["effective_total"])) == Decimal("5000.00")


def test_stay_total_pricing_returns_the_entered_value(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Stay Total Cabin")
    client_id = _create_client(registered_owner, "Stay Total Guest")

    response = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-02-01",
            "check_out": "2026-02-06",  # 5 nights
            "price_total": "5000.00",
        },
    )
    assert response.status_code == 201
    assert Decimal(str(response.json()["effective_total"])) == Decimal("5000.00")


def test_both_price_fields_supplied_is_rejected(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Both Prices Cabin")
    client_id = _create_client(registered_owner, "Both Prices Guest")

    response = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-02-01",
            "check_out": "2026-02-06",
            "price_per_night": "1000.00",
            "price_total": "5000.00",
        },
    )
    assert response.status_code == 422


def test_neither_price_field_supplied_is_rejected(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "No Price Cabin")
    client_id = _create_client(registered_owner, "No Price Guest")

    response = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-02-01",
            "check_out": "2026-02-06",
        },
    )
    assert response.status_code == 422


def test_extending_dates_rescales_per_night_pricing(registered_owner: RegisteredOwner) -> None:
    property_id = _create_property(registered_owner, "Rescale Cabin")
    client_id = _create_client(registered_owner, "Rescale Guest")

    created = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-03-01",
            "check_out": "2026-03-06",  # 5 nights @ 1000 = 5000
            "price_per_night": "1000.00",
        },
    ).json()
    assert Decimal(str(created["effective_total"])) == Decimal("5000.00")

    extended = client.patch(
        f"/reservations/{created['id']}",
        headers=registered_owner.headers,
        json={"check_out": "2026-03-08"},  # now 7 nights
    )
    assert extended.status_code == 200
    assert Decimal(str(extended.json()["effective_total"])) == Decimal("7000.00")


def test_extending_dates_does_not_rescale_stay_total_pricing(
    registered_owner: RegisteredOwner,
) -> None:
    property_id = _create_property(registered_owner, "Fixed Total Cabin")
    client_id = _create_client(registered_owner, "Fixed Total Guest")

    created = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-04-01",
            "check_out": "2026-04-06",  # 5 nights
            "price_total": "5000.00",
        },
    ).json()
    assert Decimal(str(created["effective_total"])) == Decimal("5000.00")

    extended = client.patch(
        f"/reservations/{created['id']}",
        headers=registered_owner.headers,
        json={"check_out": "2026-04-08"},  # now 7 nights, price_total untouched
    )
    assert extended.status_code == 200
    assert Decimal(str(extended.json()["effective_total"])) == Decimal("5000.00")
