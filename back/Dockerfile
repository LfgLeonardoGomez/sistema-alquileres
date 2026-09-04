FROM python:3.13-slim AS base
WORKDIR /app


# ---------------------------------------------------------------------------
# dev: bind-mount-friendly local/test image. Keeps the [dev] extras
# (pytest) and tests/, scripts/ present -- this is what `api`, `test`, and
# `migrate` build in docker-compose.yml.
# ---------------------------------------------------------------------------
FROM base AS dev

COPY pyproject.toml ./
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests
COPY migrations ./migrations
COPY alembic.ini ./

RUN pip install --no-cache-dir -e ".[dev]"

EXPOSE 8000

CMD ["fastapi", "run", "--host", "0.0.0.0", "--port", "8000"]


# ---------------------------------------------------------------------------
# builder: installs the project WITHOUT the [dev] extras into a clean
# prefix (design D19). scripts/ is copied here only because pyproject.toml's
# hatchling wheel target packages both app/ and scripts/ -- the prefix
# built here is copied into the prod stage below, but scripts/ itself is
# never copied into that runtime stage.
# ---------------------------------------------------------------------------
FROM base AS builder

COPY pyproject.toml ./
COPY app ./app
COPY scripts ./scripts
COPY migrations ./migrations
COPY alembic.ini ./

RUN pip install --no-cache-dir --prefix=/install .


# ---------------------------------------------------------------------------
# prod: the production runtime (design D19). Carries no dev dependencies
# and no tests/, scripts/, docker/, or .env* -- an explicit COPY allowlist
# is the mechanism, not .dockerignore alone. Runs as a non-root user.
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS prod
WORKDIR /app

# Fixed UID so the runtime identity is deterministic across rebuilds and
# hosts, and never root (UID 0).
RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --no-create-home --shell /usr/sbin/nologin appuser

COPY --from=builder /install /usr/local
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./

# Buffered stdout means the last log lines before a crash are lost, which
# defeats the structured-logging slice this image will later carry.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# --workers 1 is a rate-limiter CORRECTNESS constraint (design D24), not a
# performance choice: the auth rate limiter's counters are in-process and
# per-worker, so a second worker silently multiplies every budget. uvicorn
# is invoked explicitly (not `fastapi run`) so the worker count is visible
# in the image rather than inherited from a framework default that can
# change between releases.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
