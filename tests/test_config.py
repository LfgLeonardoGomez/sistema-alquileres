"""Settings must refuse to boot without JWT_SECRET or REGISTRATION_TOKEN.

These are exercised as subprocesses (not in-process imports) because
Settings() is constructed once at import time in app.config, and Python
caches modules — an in-process test could not observe a second, differently
failing import in the same session.
"""

import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

BASE_ENV = {
    "PATH": os.environ.get("PATH", ""),
    "DATABASE_URL": "postgresql+psycopg://alquileres_app:x@db:5432/alquileres",
    "JWT_SECRET": "unit-test-secret-padded-to-32-bytes",
    "REGISTRATION_TOKEN": "unit-test-registration-token",
}


def _run_settings_construction(env: dict[str, str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", "from app.config import Settings; Settings()"],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


def test_settings_boots_with_all_required_vars() -> None:
    result = _run_settings_construction(dict(BASE_ENV))
    assert result.returncode == 0, result.stderr


def test_settings_refuses_to_boot_without_jwt_secret() -> None:
    env = dict(BASE_ENV)
    del env["JWT_SECRET"]
    result = _run_settings_construction(env)
    assert result.returncode != 0
    assert "jwt_secret" in result.stderr.lower()


def test_settings_refuses_to_boot_without_registration_token() -> None:
    env = dict(BASE_ENV)
    del env["REGISTRATION_TOKEN"]
    result = _run_settings_construction(env)
    assert result.returncode != 0
    assert "registration_token" in result.stderr.lower()


def test_settings_refuses_jwt_secret_shorter_than_32_bytes() -> None:
    """HS256 with a short key is offline-bruteforceable. PyJWT only *warns*
    (InsecureKeyLengthWarning), and a warning among 20 others at boot is a
    warning nobody reads -- so the refusal has to happen here."""
    env = dict(BASE_ENV)
    env["JWT_SECRET"] = "x" * 31
    result = _run_settings_construction(env)
    assert result.returncode != 0
    assert "jwt_secret" in result.stderr.lower()


def test_settings_accepts_jwt_secret_of_exactly_32_bytes() -> None:
    env = dict(BASE_ENV)
    env["JWT_SECRET"] = "x" * 32
    result = _run_settings_construction(env)
    assert result.returncode == 0, result.stderr
