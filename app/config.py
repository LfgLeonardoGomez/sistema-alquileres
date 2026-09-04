"""Application settings.

`jwt_secret` and `registration_token` deliberately have no defaults: a
default secret in source is how a staging key ends up in production
(design D10). The app must refuse to boot without them. `environment`
follows the same rule for the same reason (design D20): a default of
"development" would make the production migrator-credential check below
fail open on a forgotten variable, which is the only way it can fail.
"""

import os
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
