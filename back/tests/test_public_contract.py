"""Public availability calendar contract test (design D9, layer 3;
public-availability-calendar spec "Response Exposes Only Property Identity
and Occupied Ranges" / "No Private Fields Are Reachable").

Seeds a tenant with a distinctive client name, phone, price, and payment
note, then asserts NONE of those strings appear anywhere in the raw
response body -- string-level, not field-level, so accidental nesting
(e.g. a joined object serialized by mistake) is caught too. This is the
single most important test in Phase 6: the public endpoint is the
highest-risk data-leak surface in this system.
"""

import uuid

from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import RegisteredOwner

client = TestClient(app)

_DISTINCTIVE_CLIENT_NAME = "Zzyzx Confidential Guest Wonderthorpe"
_DISTINCTIVE_PHONE = f"+549{uuid.uuid4().int % 10**10:010d}"
_DISTINCTIVE_PRICE = "13371.00"
_DISTINCTIVE_NOTE = "SecretDepositNoteXyzzyPlugh"


def _seed_reservation_with_private_data(owner: RegisteredOwner) -> dict:
    property_id = client.post(
        "/properties", headers=owner.headers, json={"name": "Public Contract Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=owner.headers,
        json={"full_name": _DISTINCTIVE_CLIENT_NAME, "phone": _DISTINCTIVE_PHONE},
    ).json()["id"]
    reservation = client.post(
        "/reservations",
        headers=owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-12-05",
            "check_out": "2026-12-10",
            "price_total": _DISTINCTIVE_PRICE,
        },
    ).json()
    client.post(
        f"/reservations/{reservation['id']}/payments",
        headers=owner.headers,
        json={"amount": "500.00", "method": "cash", "note": _DISTINCTIVE_NOTE},
    )
    return reservation


def test_public_response_never_contains_private_strings(
    registered_owner: RegisteredOwner,
) -> None:
    _seed_reservation_with_private_data(registered_owner)

    response = client.get(
        f"/public/{registered_owner.tenant_slug}/availability",
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )

    assert response.status_code == 200
    raw_body = response.text
    assert _DISTINCTIVE_CLIENT_NAME not in raw_body
    assert _DISTINCTIVE_PHONE not in raw_body
    assert _DISTINCTIVE_PRICE not in raw_body
    assert _DISTINCTIVE_NOTE not in raw_body


def test_public_response_includes_the_occupied_range(
    registered_owner: RegisteredOwner,
) -> None:
    _seed_reservation_with_private_data(registered_owner)

    response = client.get(
        f"/public/{registered_owner.tenant_slug}/availability",
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["occupied"] == [{"check_in": "2026-12-05", "check_out": "2026-12-10"}]


def test_public_availability_unknown_slug_returns_404() -> None:
    response = client.get(
        "/public/does-not-exist-slug/availability",
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert response.status_code == 404


def test_public_availability_excludes_cancelled_reservations(
    registered_owner: RegisteredOwner,
) -> None:
    """The gap the task list omitted: a cancelled reservation's nights
    must not appear as occupied on the public calendar -- the DB's
    `reservations_no_overlap` EXCLUDE constraint already treats cancelled
    rows as non-blocking (`WHERE status <> 'cancelled'`), so the public
    calendar must agree, or it would show a false "unavailable" for
    nights that are actually bookable."""
    property_id = client.post(
        "/properties", headers=registered_owner.headers, json={"name": "Cancel Cabin"}
    ).json()["id"]
    client_id = client.post(
        "/clients",
        headers=registered_owner.headers,
        json={"full_name": "Cancel Guest", "phone": f"+549{uuid.uuid4().int % 10**10:010d}"},
    ).json()["id"]
    reservation = client.post(
        "/reservations",
        headers=registered_owner.headers,
        json={
            "property_id": property_id,
            "client_id": client_id,
            "check_in": "2026-12-15",
            "check_out": "2026-12-20",
            "price_total": "1000.00",
        },
    ).json()
    client.post(
        f"/reservations/{reservation['id']}/cancel", headers=registered_owner.headers
    )

    response = client.get(
        f"/public/{registered_owner.tenant_slug}/availability",
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["occupied"] == []


def test_public_contact_whatsapp_absent_from_availability_raw_bytes(
    registered_owner: RegisteredOwner,
) -> None:
    """Design D40/D46: the `whatsapp` value must appear in
    `/public/{slug}/contact`'s response and must NOT appear anywhere in the
    raw bytes of `/public/{slug}/availability`'s response -- the same
    string-absence shape `test_public_response_never_contains_private_strings`
    above uses for reservation/client/payment data. `get_public_availability()`
    is untouched by this change (design D40), so this test proves that by
    construction as well as by observation."""
    _seed_reservation_with_private_data(registered_owner)
    distinctive_whatsapp = f"549{uuid.uuid4().int % 10**11:011d}"
    client.patch(
        "/tenant",
        headers=registered_owner.headers,
        json={"whatsapp": distinctive_whatsapp},
    )

    contact_response = client.get(f"/public/{registered_owner.tenant_slug}/contact")
    assert contact_response.status_code == 200
    assert contact_response.json()["whatsapp"] == distinctive_whatsapp

    availability_response = client.get(
        f"/public/{registered_owner.tenant_slug}/availability",
        params={"from": "2026-12-01", "to": "2027-01-01"},
    )
    assert availability_response.status_code == 200
    assert distinctive_whatsapp not in availability_response.text


def test_public_availability_requires_both_window_parameters() -> None:
    """`from` and `to` are mandatory: neither carries a default.

    This guards the ABSENCE of a default, which is easy to erode. Giving
    either parameter a fallback -- a well-meant "default to the current
    month" -- would make the endpoint answer for a window the caller never
    asked for, and a client rendering a calendar would silently show the
    wrong period rather than failing loudly.
    """
    client = TestClient(app)
    path = "/public/mar-del-tuyu-cabins/availability"

    assert client.get(path).status_code == 422
    assert client.get(f"{path}?from=2026-12-01").status_code == 422
    assert client.get(f"{path}?to=2026-12-31").status_code == 422
    assert client.get(f"{path}?from=2026-12-01&to=2026-12-31").status_code == 200
