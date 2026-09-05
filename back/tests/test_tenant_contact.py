"""`GET`/`PATCH /tenant` and the `whatsapp` validator (design D38, D39,
tenant-management spec). Layers 1+2 of D38's four-layer defense are proved
here at the HTTP level -- layers 3 (column grant) and 4 (RLS) are proved at
the raw-SQL level in `test_tenants_rls.py`.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.public import PublicContact
from app.schemas.tenant import TenantUpdate
from tests.conftest import RegisteredOwner, SeededTenant

client = TestClient(app)

# ---- the whatsapp validator (pure, no DB) --------------------------------


def test_whatsapp_strips_separators_from_well_formed_input() -> None:
    update = TenantUpdate(whatsapp="54 (9) 11-2233-4455")
    assert update.whatsapp == "5491122334455"


def test_whatsapp_rejects_free_text_rather_than_stripping_to_digits() -> None:
    """"llamame al 1122334455" must not be silently coerced into
    "1122334455" -- letters make the whole value invalid, not just the
    letters themselves."""
    with pytest.raises(ValidationError):
        TenantUpdate(whatsapp="llamame al 1122334455")


def test_whatsapp_rejects_seven_digits() -> None:
    with pytest.raises(ValidationError):
        TenantUpdate(whatsapp="1234567")


def test_whatsapp_rejects_sixteen_digits() -> None:
    with pytest.raises(ValidationError):
        TenantUpdate(whatsapp="1234567890123456")


def test_whatsapp_accepts_a_leading_plus() -> None:
    """A `+` is accepted as an input character rather than rejected outright
    -- it does not survive normalisation (D39: "digits only, E.164 without
    the +", mirroring migration 0002's digits-only CHECK exactly)."""
    update = TenantUpdate(whatsapp="+5491122334455")
    assert update.whatsapp == "5491122334455"


def test_whatsapp_none_is_accepted_unchanged() -> None:
    update = TenantUpdate(whatsapp=None)
    assert update.whatsapp is None


# ---- GET/PATCH /tenant (HTTP surface) ------------------------------------


def test_get_tenant_unauthenticated_returns_401() -> None:
    response = client.get("/tenant")
    assert response.status_code == 401


def test_patch_tenant_with_extra_tenant_id_field_is_rejected(
    registered_owner: RegisteredOwner,
) -> None:
    response = client.patch(
        "/tenant",
        headers=registered_owner.headers,
        json={"whatsapp": "5491122334455", "tenant_id": "not-a-real-field"},
    )
    assert response.status_code == 422


def test_patch_tenant_sets_whatsapp(registered_owner: RegisteredOwner) -> None:
    response = client.patch(
        "/tenant",
        headers=registered_owner.headers,
        json={"whatsapp": "+5491122334455"},
    )
    assert response.status_code == 200
    assert response.json()["whatsapp"] == "5491122334455"

    get_response = client.get("/tenant", headers=registered_owner.headers)
    assert get_response.status_code == 200
    assert get_response.json()["whatsapp"] == "5491122334455"


def test_patch_tenant_explicit_null_clears_previously_set_value(
    registered_owner: RegisteredOwner,
) -> None:
    client.patch(
        "/tenant", headers=registered_owner.headers, json={"whatsapp": "5491122334455"}
    )

    response = client.patch(
        "/tenant", headers=registered_owner.headers, json={"whatsapp": None}
    )
    assert response.status_code == 200
    assert response.json()["whatsapp"] is None


def test_patch_tenant_omitted_whatsapp_is_a_noop(registered_owner: RegisteredOwner) -> None:
    client.patch(
        "/tenant", headers=registered_owner.headers, json={"whatsapp": "5491122334455"}
    )

    response = client.patch("/tenant", headers=registered_owner.headers, json={})
    assert response.status_code == 200
    assert response.json()["whatsapp"] == "5491122334455"


# ---- cross-tenant write proof (D38 layers 1+2, HTTP-level) ---------------


def test_patch_tenant_never_touches_another_tenants_row(
    seed_three_tenants: list[SeededTenant],
) -> None:
    """An owner of Tenant A has no tenant identifier available to supply --
    there is no parameter to attack (D38 Layer 1). This is the end-to-end
    HTTP proof; `test_tenants_rls.py`'s unqualified-UPDATE test is the
    raw-SQL proof of the same guarantee (Layer 4)."""
    tenant_a, tenant_b, _ = seed_three_tenants
    headers_a = {"Authorization": f"Bearer {tenant_a.access_token}"}
    headers_b = {"Authorization": f"Bearer {tenant_b.access_token}"}

    client.patch("/tenant", headers=headers_b, json={"whatsapp": "5491100000000"})

    response = client.patch(
        "/tenant", headers=headers_a, json={"whatsapp": "5491122334455"}
    )
    assert response.status_code == 200

    b_after = client.get("/tenant", headers=headers_b)
    assert b_after.json()["whatsapp"] == "5491100000000"


# ---- GET /public/{slug}/contact (design D40, public-tenant-contact spec) ---


def test_public_contact_unknown_slug_returns_404() -> None:
    response = client.get("/public/does-not-exist-slug/contact")
    assert response.status_code == 404


def test_public_contact_returns_name_and_configured_whatsapp(
    registered_owner: RegisteredOwner,
) -> None:
    client.patch(
        "/tenant", headers=registered_owner.headers, json={"whatsapp": "5491122334455"}
    )

    response = client.get(f"/public/{registered_owner.tenant_slug}/contact")
    assert response.status_code == 200
    assert response.json() == {"name": "Test Owner", "whatsapp": "5491122334455"}


def test_public_contact_returns_null_whatsapp_when_unset(
    registered_owner: RegisteredOwner,
) -> None:
    response = client.get(f"/public/{registered_owner.tenant_slug}/contact")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Test Owner"
    assert "whatsapp" in body
    assert body["whatsapp"] is None


def test_public_contact_model_carries_no_private_fields() -> None:
    """Public-tenant-contact spec, "The Response Model Carries Only Tenant
    Identity And Contact": none of these field names may appear on
    `PublicContact`, structurally -- not merely absent from one response."""
    forbidden_fields = {
        "client_name",
        "client_phone",
        "email",
        "national_id",
        "price",
        "total",
        "amount",
        "payment",
        "reservation_id",
        "property_id",
    }
    assert forbidden_fields.isdisjoint(PublicContact.model_fields.keys())
