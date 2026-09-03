-- Cluster-level roles for the Cabin Booking API (design D5).
-- Created once at container init time via docker-entrypoint-initdb.d,
-- never by application code or by the schema bootstrap script -- roles
-- are cluster-level infrastructure (see engram: architecture/schema-bootstrap).

CREATE ROLE alquileres_migrator WITH LOGIN PASSWORD 'alquileres_migrator_password';
-- Owns every table. Runs the schema bootstrap and seed scripts.
-- Never used by the running API process.

CREATE ROLE alquileres_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'alquileres_app_password';
-- Used by the API process, and by the app-role test suite. Never owns a
-- table, never bypasses RLS -- see D5: RLS is bypassed by superusers,
-- BYPASSRLS roles, and the table owner, so getting this wrong makes every
-- isolation test pass vacuously.

-- PostgreSQL 15+ revokes CREATE on the "public" schema from PUBLIC by
-- default. alquileres_migrator does not own the schema, so it needs this
-- grant explicitly or every CREATE TABLE in the bootstrap script fails.
-- Granted once here, not by the bootstrap script: the bootstrap only
-- drops/creates TABLES (via SQLAlchemy metadata), it never drops the
-- schema itself, so this permission survives every reset.
GRANT CREATE, USAGE ON SCHEMA public TO alquileres_migrator;
GRANT USAGE ON SCHEMA public TO alquileres_app;

-- CREATE EXTENSION requires CREATE privilege on the DATABASE itself, not
-- just the schema (extensions are database-level objects). This script is
-- shared by both the `db` and `db-test` Compose services, whose database
-- names differ, so the grant target is resolved dynamically.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO alquileres_migrator', current_database());
END $$;
