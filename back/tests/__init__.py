"""Makes `tests` a real package.

Required so that pytest's own `conftest.py` auto-loading and an explicit
`from tests.conftest import ...` elsewhere resolve to the SAME module
object. Without this file, pytest imports `tests/conftest.py` as a
top-level module named `conftest` (inserting `tests/` onto `sys.path`),
while `from tests.conftest import fresh_client_address` in another test
file imports a SECOND, independent module object named `tests.conftest`.
Each runs its own top-level code, so `fresh_client_address`'s
`itertools.count(1)` counter existed twice, in lockstep, silently
producing IDENTICAL address sequences from two "different" callers --
defeating the very isolation it exists to provide (design D24: this
collided the `registered_owner` fixture's rate-limit key with other
files' keys at the same call index, exhausting the shared register
budget partway through a full suite run).
"""
