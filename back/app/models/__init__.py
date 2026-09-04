"""Importing this package registers every model's table on `Base.metadata`.

This is what `app/db/bootstrap.py` used to do before it was deleted
(design D13, commit 8 of the `production-readiness` change). Without
these imports, `Base.metadata` is empty for anything that imports it
without importing the models first -- which is exactly what
`migrations/env.py`'s `target_metadata` does. An empty metadata does not
raise; it makes `alembic.autogenerate.compare_metadata()`
(`tests/test_schema_is_migrated.py`, design D17) report "drop every
table", or worse, report nothing at all.

Add each new model import here in the same commit that creates it.
"""

from app.models import client as _client  # noqa: F401
from app.models import payment as _payment  # noqa: F401
from app.models import property as _property  # noqa: F401
from app.models import reservation as _reservation  # noqa: F401
from app.models import tenant as _tenant  # noqa: F401
from app.models import user as _user  # noqa: F401
