"""Tenant I/O models (design D39). `TenantUpdate`'s `whatsapp` validator is
the app-layer half of the house pattern (D11: Pydantic first, the CHECK as
the concurrent-safe backstop) -- the DB-side half is migration `0002`'s
`tenants_whatsapp_format` CHECK, which asserts the exact same shape after
this validator's normalisation.

`extra="forbid"` on `TenantUpdate` is design D38's Layer 1: there is no
tenant identifier anywhere in this request surface, and an attempt to
smuggle one in (`tenant_id`, or anything else) must be a 422, not a
silently ignored field.
"""

import re
import uuid

from pydantic import BaseModel, ConfigDict, field_validator

# Characters a caller may legitimately type around a phone number: digits,
# spaces, a leading `+`, and the punctuation used in printed formats like
# `(011) 15-1234-5678`. Anything outside this set is rejected BEFORE any
# stripping happens -- see the validator below for why the order matters.
_ALLOWED_CHARS = re.compile(r"^[0-9 +().-]*$")
# Mirrors migration 0002's `tenants_whatsapp_format` CHECK
# (`whatsapp ~ '^[0-9]{8,15}$'`) exactly -- digits only, no `+`. D39's
# "Representation" decision is explicit: "digits only, E.164 without the
# +", precisely what `wa.me/<digits>` consumes. A `+` is accepted as an
# INPUT character (rejecting it outright would refuse a well-formed
# "+549..." paste), but it does not survive normalisation, same as any
# other separator -- keeping it would produce a value the CHECK itself
# rejects, defeating the whole Pydantic-first/CHECK-backstop pattern (D11).
_DIGITS_ONLY = re.compile(r"^\d{8,15}$")


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    whatsapp: str | None


class TenantUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    whatsapp: str | None = None

    @field_validator("whatsapp")
    @classmethod
    def normalise_whatsapp(cls, value: str | None) -> str | None:
        if value is None:
            return None

        # (a) Reject any character outside [0-9 +().-] BEFORE stripping
        # anything. This is what stops "llamame al 1122334455" from being
        # silently coerced into a valid-looking number -- stripping first
        # would happily throw away "llamame al" and keep the digits.
        if not _ALLOWED_CHARS.match(value):
            raise ValueError(
                "whatsapp may only contain digits, spaces, and +().- separators"
            )

        # (b) Strip everything that is not a digit -- including a leading
        # `+`, which is accepted as input but does not survive
        # normalisation (see _DIGITS_ONLY's comment above).
        digits = re.sub(r"\D", "", value)

        # (c) Require 8-15 digits.
        if not _DIGITS_ONLY.match(digits):
            raise ValueError("whatsapp must contain 8 to 15 digits")

        return digits
