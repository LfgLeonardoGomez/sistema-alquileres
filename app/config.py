"""Application settings.

`jwt_secret` and `registration_token` deliberately have no defaults: a
default secret in source is how a staging key ends up in production
(design D10). The app must refuse to boot without them.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None)

    database_url: str
    jwt_secret: str
    registration_token: str


@lru_cache
def get_settings() -> Settings:
    return Settings()
