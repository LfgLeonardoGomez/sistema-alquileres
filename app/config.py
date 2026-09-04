"""Application settings.

`jwt_secret` and `registration_token` deliberately have no defaults: a
default secret in source is how a staging key ends up in production
(design D10). The app must refuse to boot without them. `environment`
follows the same rule for the same reason (design D20): a default of
"development" would make the production migrator-credential check below
fail open on a forgotten variable, which is the only way it can fail.
`cors_allowed_origins` follows the same no-default rule too (design D22),
but for a different reason: an *absent* variable means nobody ever
decided the CORS policy, whereas an explicit empty string is a legal,
deliberate answer ("no browser access") -- only a missing variable is
refused.

`trusted_proxy_count` follows the same no-default rule for yet another
reason (design D24): it tells `app/ratelimit.py` how many entries of
`X-Forwarded-For`, from the right, were written by infrastructure this
deployment trusts. A default of `0` would silently make a real proxy's
address the "client" for every caller behind it -- collapsing everyone
into one shared rate-limit bucket and locking them all out together the
first time one of them hits the budget. Fail loud at boot instead.
"""

import os
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_origins(value: str) -> list[str]:
    """A comma-separated origin list, trimmed and with empty entries
    dropped. `""` (the legal "no browser access" answer) correctly splits
    to `[]`, not `[""]`."""
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None)

    database_url: str
    # HS256 with a key shorter than the digest is offline-bruteforceable.
    # PyJWT only emits InsecureKeyLengthWarning and signs anyway, and a
    # warning among twenty others at boot is a warning nobody reads --
    # so refusing to boot is the only enforcement that actually holds.
    # RFC 7518 section 3.2: 32 bytes minimum for HS256.
    jwt_secret: str = Field(min_length=32)
    registration_token: str
    environment: str
    # Not a secret and not dangerous when wrong -- a default is fine here,
    # unlike jwt_secret/registration_token/environment above (design D23).
    log_level: str = "INFO"
    # Declared as `str`, NOT `list[str]` (design D22's implementation
    # note): pydantic-settings attempts a JSON decode for complex env
    # types, so a plain comma-separated value like
    # `CORS_ALLOWED_ORIGINS=https://a,https://b` would fail to parse with
    # a confusing error. Split via `_split_origins` in the `cors_origins`
    # property below instead.
    cors_allowed_origins: str
    # Required, no default (design D24) -- same fail-neither-open-nor-closed
    # rule as `environment`/`cors_allowed_origins` above. `0` for a direct
    # connection (no reverse proxy), `n` for `n` trusted proxy hops.
    trusted_proxy_count: int = Field(ge=0)

    @field_validator("cors_allowed_origins")
    @classmethod
    def _reject_wildcard_origin(cls, value: str) -> str:
        # Rejected by a validator, at boot -- not by review discipline
        # (design D22). An empty list already expresses "no frontend
        # configured"; a wildcard expresses nothing except that someone
        # was unblocking themselves.
        if "*" in _split_origins(value):
            raise ValueError(
                "cors_allowed_origins must not contain '*' -- wildcard "
                "browser origins are rejected at boot, not by review "
                "(design D22); use an explicit, empty value for "
                "'no browser access, deliberately' instead"
            )
        return value

    @property
    def cors_origins(self) -> list[str]:
        return _split_origins(self.cors_allowed_origins)

    @model_validator(mode="after")
    def _reject_migrator_credential_in_production(self) -> "Settings":
        # `Settings` never gains a `migrator_database_url` field -- reading
        # the raw process environment here is the only sanctioned check.
        # Layer 3 of D20's three-layer defence: packaging (no scripts/ in
        # the prod image) and Compose (api loses the env var entirely) are
        # the other two. This one has teeth even if both of those drift.
        if self.environment == "production" and "MIGRATOR_DATABASE_URL" in os.environ:
            raise ValueError(
                "migrator_database_url must not be present in the process "
                "environment when ENVIRONMENT=production -- the API process "
                "must never hold table-owner credentials (design D20)"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
