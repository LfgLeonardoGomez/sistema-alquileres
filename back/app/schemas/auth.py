"""Auth I/O models. Deliberately separate from `app.models.user` (design
D1/D9) -- a response model is never built from the ORM `User` row, so
`password_hash` can never leak by accident.

`RegisterRequest.tenant_slug`'s validator is the app-layer half of the
house pattern `app/schemas/tenant.py`'s `whatsapp` validator already
established (design D11: Pydantic first, the CHECK as the concurrent-safe
backstop) -- the DB-side half is migration `0004`'s `tenants_slug_format`
CHECK, which asserts the exact same shape after this validator's
normalisation. Registration is the ONLY place a slug is ever set (the
column carries no UPDATE grant for `alquileres_app`, see
`app/models/tenant.py`), so this is the only validator that needs to
exist: `LoginRequest.tenant_slug` below looks up an EXISTING row and is
deliberately left untouched -- tightening it would lock out any tenant
whose slug predates this CHECK.
"""

import re
import uuid

from pydantic import BaseModel, EmailStr, field_validator

# Lowercase letters, digits, and hyphens; no leading/trailing hyphen and no
# consecutive hyphens -- the shape every slug already stored (e.g.
# `mar-del-tuyu-cabins`) already has, and the exact shape migration `0004`'s
# `tenants_slug_format` CHECK asserts independently.
_SLUG_SHAPE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# 3 -- the shortest slug already in production use (`aya`) is exactly this
# long; shorter is not enough to be a meaningful, guess-resistant public
# identifier once it starts appearing in links sent to guests over
# WhatsApp. 63 -- the DNS label limit, a well-understood, non-arbitrary
# bound comfortably inside the column's `String(100)` (`app/models/tenant.py`),
# leaving headroom rather than using the full 100.
_MIN_LENGTH = 3
_MAX_LENGTH = 63


class RegisterRequest(BaseModel):
    tenant_slug: str
    name: str
    email: EmailStr
    password: str

    @field_validator("tenant_slug")
    @classmethod
    def normalise_slug(cls, value: str) -> str:
        # (a) Normalise what's safely normalisable: surrounding whitespace
        # and case. Unlike `tenant.py`'s `whatsapp` validator -- which
        # must check the raw input's characters BEFORE deleting every
        # non-digit one, because that deletion could silently coerce
        # garbage ("llamame al 1122334455") into something valid-looking
        # -- neither step here is destructive. Trimming the edges and
        # folding case cannot hide or mask a disallowed character
        # anywhere in the value, so it is safe to do before the shape
        # check below rather than after it.
        value = value.strip().lower()

        # (b) Reject anything the shape does not allow: characters outside
        # [a-z0-9-], a leading/trailing hyphen, or consecutive hyphens.
        # An empty string (or one that was only whitespace) also fails
        # here, since the pattern requires at least one character.
        if not _SLUG_SHAPE.match(value):
            raise ValueError(
                "tenant_slug must contain only lowercase letters, digits, "
                "and single hyphens, with no leading, trailing, or "
                "consecutive hyphen"
            )

        # (c) Length bounds -- see module-level comment for why 3 and 63.
        if not (_MIN_LENGTH <= len(value) <= _MAX_LENGTH):
            raise ValueError(
                f"tenant_slug must be between {_MIN_LENGTH} and {_MAX_LENGTH} characters"
            )

        return value


class LoginRequest(BaseModel):
    tenant_slug: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
