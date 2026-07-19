\set ON_ERROR_STOP on
\getenv cleanup_project_ref FIXTURE_CLEANUP_PROJECT_REF

select :'cleanup_project_ref' = 'dhvfsyteqsxagokoerrx' as project_ref_ok \gset
\if :project_ref_ok
\else
  do $$ begin
    raise exception 'Refusing fixture cleanup disable for a non-production project ref.'
      using errcode = '42501';
  end $$;
\endif

select pg_get_userbyid(class.relowner) = current_user as owner_ok
from pg_class class
where class.oid = 'private.fixture_cleanup_controller_keys_v1'::regclass
\gset
\if :owner_ok
\else
  do $$ begin
    raise exception 'Fixture cleanup disable requires the database owner.'
      using errcode = '42501';
  end $$;
\endif

begin;
select pg_advisory_xact_lock(
  hashtextextended('bmh-institute-fixture-cleanup-v1', 0)
);

revoke all on function public.admin_cleanup_fixture_catalog_v1(
  text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
drop function public.admin_cleanup_fixture_catalog_v1(
  text, text, jsonb, jsonb
);
revoke all on function public.fixture_cleanup_transport_probe_v1()
  from public, anon, authenticated, service_role;
drop function public.fixture_cleanup_transport_probe_v1();

-- Leave the historical checksum-only implementation private and unreachable.
-- This utility must never move it to public or restore service_role execution.
revoke all on function
  private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text, text)
  from public, anon, authenticated, service_role;

update private.fixture_cleanup_controller_keys_v1
set
  is_active = false,
  retired_at = coalesce(retired_at, clock_timestamp())
where is_active;

commit;
