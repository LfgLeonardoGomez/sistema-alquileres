#!/usr/bin/env bash
# Cluster-level roles for the Cabin Booking API (design D5).
#
# Created once at container init time via docker-entrypoint-initdb.d,
# never by application code or by a migration -- roles are cluster-level
# infrastructure (see engram: architecture/schema-bootstrap).
#
# This is a SHELL script, not the SQL file it replaces (design D21):
# `01-roles.sql` contained the role passwords as literal text, committed
# to the repository -- a file that is fatally easy to copy-paste into a
# production console and ship `alquileres_app_password` on a real cluster.
# This script instead reads both passwords from the environment (no
# defaults; it refuses to run without them), so the file itself is
# copy-safe. It still only ever runs at Docker container init on `db` and
# `db-test` -- never on managed Postgres. See the "Provisioning a fresh
# PostgreSQL cluster" runbook in README.md for that path.
#
# Runs as the Postgres superuser under docker-entrypoint-initdb.d, so it
# can use `psql` exactly like the official postgres image's own examples.

set -euo pipefail

: "${ALQUILERES_MIGRATOR_PASSWORD:?ALQUILERES_MIGRATOR_PASSWORD must be set (see docker-compose.yml)}"
: "${ALQUILERES_APP_PASSWORD:?ALQUILERES_APP_PASSWORD must be set (see docker-compose.yml)}"

psql -v ON_ERROR_STOP=1 \
     -v migrator_password="$ALQUILERES_MIGRATOR_PASSWORD" \
     -v app_password="$ALQUILERES_APP_PASSWORD" \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" <<-'EOSQL'
    CREATE ROLE alquileres_migrator WITH LOGIN PASSWORD :'migrator_password';
    -- Owns every table. Runs the schema migrations and seed scripts.
    -- Never used by the running API process.

    CREATE ROLE alquileres_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_password';
    -- Used by the API process, and by the app-role test suite. Never owns
    -- a table, never bypasses RLS -- see D5: RLS is bypassed by
    -- superusers, BYPASSRLS roles, and the table owner, so getting this
    -- wrong makes every isolation test pass vacuously.

    -- PostgreSQL 15+ revokes CREATE on the "public" schema from PUBLIC by
    -- default. alquileres_migrator does not own the schema, so it needs
    -- this grant explicitly or every CREATE TABLE in the migrations fails.
    -- Granted once here, not by a migration: a migration only ever
    -- creates/drops TABLES, it never drops the schema itself, so this
    -- permission survives every `alembic downgrade base`.
    GRANT CREATE, USAGE ON SCHEMA public TO alquileres_migrator;
    GRANT USAGE ON SCHEMA public TO alquileres_app;

    -- CREATE EXTENSION requires CREATE privilege on the DATABASE itself,
    -- not just the schema (extensions are database-level objects). This
    -- script is shared by both the `db` and `db-test` Compose services,
    -- whose database names differ, so the grant target is resolved
    -- dynamically via current_database().
    DO $do$
    BEGIN
      EXECUTE format('GRANT CREATE ON DATABASE %I TO alquileres_migrator', current_database());
    END $do$;
EOSQL
