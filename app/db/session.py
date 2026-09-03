"""Engine + session factory for the API process (alquileres_app role).

The tenant-scoped dependency (`get_tenant_session`, D4) is added in the
auth/isolation slice -- it does not exist yet, on purpose.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
