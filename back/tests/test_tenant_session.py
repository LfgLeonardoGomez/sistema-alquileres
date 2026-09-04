"""`tenant_scoped_session` is the primitive behind design D4: it opens a
transaction, sets `app.tenant_id` transaction-locally, and RLS does the
rest. These tests connect through the app-role engine (`SessionLocal` in
`app.db.session`, bound to `alquileres_app`) -- exactly how the real API
connects. Running this as the migrator would prove nothing (design D5's
structural note)."""

import uuid

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.db.session import tenant_scoped_session


def _seed_user(migrator_engine: Engine, tenant_id: uuid.UUID, email: str) -> uuid.UUID:
    """`users` FORCES row-level security, which applies even to the table
    owner (design D5's "belt"). So even the migrator role must set
    `app.tenant_id` in the same transaction before an INSERT satisfies the
    policy's WITH CHECK clause."""
    user_id = uuid.uuid4()
    with migrator_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        conn.execute(
            text(
                "INSERT INTO users (id, tenant_id, email, password_hash) "
                "VALUES (:id, :tid, :email, 'irrelevant-hash')"
            ),
            {"id": user_id, "tid": tenant_id, "email": email},
        )
    return user_id


def _two_seeded_tenant_ids(migrator_engine: Engine) -> list[uuid.UUID]:
    with migrator_engine.connect() as conn:
        rows = conn.execute(text("SELECT id FROM tenants ORDER BY slug LIMIT 2")).all()
    return [row[0] for row in rows]


def test_tenant_session_only_sees_its_own_tenant_users(migrator_engine: Engine) -> None:
    tenant_a, tenant_b = _two_seeded_tenant_ids(migrator_engine)
    _seed_user(migrator_engine, tenant_a, "owner-a@example.com")
    _seed_user(migrator_engine, tenant_b, "owner-b@example.com")

    with tenant_scoped_session(tenant_a) as session:
        rows = session.execute(text("SELECT tenant_id FROM users")).all()
    assert {row[0] for row in rows} == {tenant_a}

    with tenant_scoped_session(tenant_b) as session:
        rows = session.execute(text("SELECT tenant_id FROM users")).all()
    assert {row[0] for row in rows} == {tenant_b}


def _count_users_for_tenant(migrator_engine: Engine, tenant_id: uuid.UUID) -> int:
    """The migrator is also bound by `tenant_isolation` (FORCE RLS applies
    to the owner too), so this must set `app.tenant_id` in the same
    transaction just like `_seed_user` does -- otherwise the policy's
    USING clause filters out every row, migrator or not."""
    with migrator_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        return conn.execute(
            text("SELECT count(*) FROM users WHERE tenant_id = :tid"),
            {"tid": tenant_id},
        ).scalar()


def test_tenant_session_isolation_is_symmetric_with_different_row_counts(
    migrator_engine: Engine,
) -> None:
    """Triangulation: tenant A gets two new users, tenant B gets one -- an
    unequal split, so a bug that leaked a fixed row count (e.g. always
    returning 1) would not be caught by a balanced case. Expected counts
    are read from the migrator connection (no RLS) rather than hardcoded,
    so this test does not depend on execution order relative to other
    tests sharing the same session-scoped database."""
    tenant_a, tenant_b = _two_seeded_tenant_ids(migrator_engine)
    baseline_a = _count_users_for_tenant(migrator_engine, tenant_a)
    baseline_b = _count_users_for_tenant(migrator_engine, tenant_b)

    _seed_user(migrator_engine, tenant_a, "second-owner-a@example.com")
    _seed_user(migrator_engine, tenant_a, "third-owner-a@example.com")
    _seed_user(migrator_engine, tenant_b, "second-owner-b@example.com")

    with tenant_scoped_session(tenant_a) as session:
        count_a = session.execute(text("SELECT count(*) FROM users")).scalar()
    with tenant_scoped_session(tenant_b) as session:
        count_b = session.execute(text("SELECT count(*) FROM users")).scalar()

    assert count_a == baseline_a + 2
    assert count_b == baseline_b + 1
