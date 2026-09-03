"""Auth I/O models. Deliberately separate from `app.models.user` (design
D1/D9) -- a response model is never built from the ORM `User` row, so
`password_hash` can never leak by accident."""

import uuid

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    tenant_slug: str
    name: str
    email: EmailStr
    password: str


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
