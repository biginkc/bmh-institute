\set ON_ERROR_STOP on
\getenv cleanup_project_ref FIXTURE_CLEANUP_PROJECT_REF
\getenv cleanup_key_id FIXTURE_CLEANUP_CONTROLLER_KEY_ID

select :'cleanup_project_ref' = 'dhvfsyteqsxagokoerrx' as project_ref_ok \gset
\if :project_ref_ok
\else
  do $$ begin
    raise exception 'Refusing controller key retirement for a non-production project ref.'
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
    raise exception 'Controller key retirement requires the database owner.'
      using errcode = '42501';
  end $$;
\endif

begin;
select pg_advisory_xact_lock(
  hashtextextended('bmh-institute-fixture-cleanup-controller-key-v1', 0)
);
update private.fixture_cleanup_controller_keys_v1
set
  is_active = false,
  retired_at = coalesce(retired_at, clock_timestamp())
where key_id = :'cleanup_key_id'
  and is_active;
\if :ROW_COUNT
\else
  rollback;
  do $$ begin
    raise exception 'No active controller key matched the requested key id.'
      using errcode = 'P0002';
  end $$;
\endif
commit;
\echo 'Retired the fixture cleanup controller key.'
