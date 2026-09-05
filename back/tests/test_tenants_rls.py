"""`tenants`' first write path, and the four layers of D38 that protect it
(design D38/D46). `test_rls_structural.py` covers every OTHER tenant-scoped
table via a generic column-driven audit that `tenants` is deliberately
excluded from (design D5/D38: `tenants` has no `tenant_id` column, so it
can never be picked up by that query). This file is `tenants`' own,
dedicated proof, and it has two halves:

  Structural half -- the exact policy set migration `0002` created, the
  UPDATE policy's predicate text (guards against D14's stale-predicate
  trap: a policy that silently compares against `app.current_tenant_id`
  would still show up here as a policy that exists, just not one whose
  `qual`/`with_check` mentions `app.tenant_id`), and the column-scoped
  grant -- `alquileres_app` may `UPDATE` `whatsapp` and nothing else on
  `tenants`.

  Behavioural half -- connects as **`alquileres_app`**, never
  `alquileres_migrator`. The migrator bypasses every policy here entirely,
  since `tenants` is `ENABLE`d but not `FORCE`d (design D38) -- a test that
  ran as the migrator would pass while proving nothing.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import ProgrammingError

from tests.conftest import SeededTenant

# ---- structural half ----------------------------------------------------


def test_tenants_policy_set_is_exactly_the_three_named_policies(
    migrator_engine: Engine,
) -> None:
    with migrator_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT policyname, cmd, roles FROM pg_policies "
                "WHERE schemaname = 'public' AND tablename = 'tenants'"
            )
        ).all()

    by_name = {row.policyname: row for row in rows}
    assert set(by_name) == {"tenants_read", "tenants_insert", "tenants_self_update"}
    assert by_name["tenants_read"].cmd == "SELECT"
    assert by_name["tenants_insert"].cmd == "INSERT"
    assert by_name["tenants_self_update"].cmd == "UPDATE"

    for name, policy in by_name.items():
        assert set(policy.roles) == {"alquileres_app", "alquileres_migrator"}, (
            f"{name} must name both roles (design D38)"
        )


def test_tenants_self_update_predicate_references_app_tenant_id(
    migrator_engine: Engine,
) -> None:
    """D14's stale-predicate trap, applied to the new policy: a policy
    written from prose that compares against `app.current_tenant_id`
    instead of `app.tenant_id` would still exist and would still show up
    in the test above -- only inspecting the rendered predicate text
    catches it."""
    with migrator_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT qual, with_check FROM pg_policies "
                "WHERE schemaname = 'public' AND tablename = 'tenants' "
                "AND policyname = 'tenants_self_update'"
            )
        ).one()

    assert "app.tenant_id" in row.qual
    assert "app.tenant_id" in row.with_check


def test_alquileres_app_may_update_only_whatsapp_on_tenants(
    migrator_engine: Engine,
) -> None:
    with migrator_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT column_name FROM information_schema.column_privileges "
                "WHERE table_schema = 'public' AND table_name = 'tenants' "
                "AND grantee = 'alquileres_app' AND privilege_type = 'UPDATE'"
            )
        ).all()

    updatable_columns = {row.column_name for row in rows}
    assert updatable_columns == {"whatsapp"}


# ---- behavioural half (connects as alquileres_app, never the migrator) --


def test_unqualified_update_as_tenant_a_affects_only_tenant_as_row(
    seed_three_tenants: list[SeededTenant],
    app_engine: Engine,
    migrator_engine: Engine,
) -> None:
    """The deliberately dangerous case: an UPDATE with no WHERE clause at
    all. If the RLS predicate were ever dropped or mis-typed, this is the
    statement that would silently touch every tenant row."""
    tenant_a, tenant_b, _ = seed_three_tenants

    with app_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_a.id)},
        )
        result = conn.execute(text("UPDATE tenants SET whatsapp = '5491122334455'"))
        assert result.rowcount == 1

    with migrator_engine.connect() as conn:
        a_whatsapp = conn.execute(
            text("SELECT whatsapp FROM tenants WHERE id = :id"), {"id": tenant_a.id}
        ).scalar_one()
        b_whatsapp = conn.execute(
            text("SELECT whatsapp FROM tenants WHERE id = :id"), {"id": tenant_b.id}
        ).scalar_one()

    assert a_whatsapp == "5491122334455"
    assert b_whatsapp is None


def test_update_slug_as_app_role_is_denied_by_the_column_grant(
    seed_three_tenants: list[SeededTenant],
    app_engine: Engine,
) -> None:
    """Layer 3, independent of layer 4: even a same-tenant, self-scoped
    UPDATE of a column other than `whatsapp` must be denied by the
    column-scoped grant alone, regardless of what the RLS policy would
    allow."""
    tenant_a, _, _ = seed_three_tenants

    with app_engine.begin() as conn:
        conn.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_a.id)},
        )
        with pytest.raises(ProgrammingError) as exc_info:
            conn.execute(
                text("UPDATE tenants SET slug = 'x' WHERE id = :id"),
                {"id": tenant_a.id},
            )

    assert "permission denied" in str(exc_info.value).lower()


def test_select_by_slug_works_with_no_tenant_context_set(
    seed_three_tenants: list[SeededTenant],
    app_engine: Engine,
) -> None:
    """The pre-context read login and both public routes depend on must
    still work after `tenants` gains RLS -- `tenants_read`'s `USING (true)`
    is exactly as permissive as no RLS at all."""
    tenant_a, _, _ = seed_three_tenants

    with app_engine.connect() as conn:
        row = conn.execute(
            text("SELECT id FROM tenants WHERE slug = :slug"),
            {"slug": tenant_a.slug},
        ).one()

    assert row.id == tenant_a.id
