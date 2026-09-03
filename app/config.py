"""Application settings.

`jwt_secret` and `registration_token` deliberately have no defaults: a
default secret in source is how a staging key ends up in production
(design D10). The app must refuse to boot without them.
"""

from functools import lru_cache

from pydantic import Field
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
