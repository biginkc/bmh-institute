-- MANUAL ONLY. Complete a rollback pause only after all four target
-- migrations have been replayed and the operator has reviewed their output.
-- This file is intentionally outside supabase/migrations.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('bmh.hugo_rollback_confirm', true)
       is distinct from 'I_UNDERSTAND_MANUAL_ONLY' then
    raise exception
      'Hugo replay finalization is manual-only; set bmh.hugo_rollback_confirm in this session.'
      using errcode = '42501';
  end if;
end;
$$;

begin;
set local lock_timeout = '10s';
set local statement_timeout = '5min';
select pg_advisory_xact_lock(
  hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
);

do $$
declare
  v_count integer;
  v_trigger_type smallint;
begin
  if to_regclass('public.hugo_rollback_gate_tables') is null
     or to_regclass('public.hugo_rollback_quarantine_access_settings') is null
     or to_regclass('public.hugo_rollback_quarantine_enforcement_changes') is null then
    raise exception
      'Hugo rollback quarantine or deny gate is missing; refusing finalization.'
      using errcode = '55000';
  end if;

  select count(*) into v_count
  from supabase_migrations.schema_migrations
  where version = any (array[
    '20260728230000', '20260728235900',
    '20260729001500', '20260729003000'
  ]::text[]);
  if v_count <> 4 then
    raise exception
      'All four Hugo target migrations must be replayed before finalization; found %.',
      v_count
      using errcode = '55000';
  end if;

  if to_regclass('public.hugo_access_settings') is null
     or to_regclass('public.hugo_access_enforcement_changes') is null
     or to_regprocedure('public.fn_hugo_email_has_durable_activity(text)') is null
     or to_regprocedure('public.fn_hugo_lock_auth_user_insert_lifecycle()') is null then
    raise exception
      'Hugo replay did not restore the target schema; deny gate remains active.'
      using errcode = '55000';
  end if;

  select trigger_row.tgtype into v_trigger_type
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = 'auth.users'::regclass
    and trigger_row.tgname = 'hugo_auth_users_lifecycle_lock'
    and not trigger_row.tgisinternal;
  if v_trigger_type is distinct from 22 then
    raise exception
      'Hugo Auth email lifecycle trigger is not the expected BEFORE INSERT OR UPDATE OF email statement trigger.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'public.profiles'::regclass
      and policy_row.polname = 'hugo_active_authenticated_gate'
      and not policy_row.polpermissive
  ) then
    raise exception
      'Hugo replay did not restore the restrictive authenticated policy on public.profiles.'
      using errcode = '55000';
  end if;
end;
$$;

-- Restore the quarantined settings and audit rows exactly. The replayed
-- migration's default singleton row is replaced by the pre-rollback value.
insert into public.hugo_access_settings (
  singleton, enforce_grants, changed_at, changed_operation_id
)
select singleton, enforce_grants, changed_at, changed_operation_id
from public.hugo_rollback_quarantine_access_settings
on conflict (singleton) do update set
  enforce_grants = excluded.enforce_grants,
  changed_at = excluded.changed_at,
  changed_operation_id = excluded.changed_operation_id;

insert into public.hugo_access_enforcement_changes (
  operation_id, previous_enforce_grants, enforce_grants, changed_at
)
select operation_id, previous_enforce_grants, enforce_grants, changed_at
from public.hugo_rollback_quarantine_enforcement_changes
on conflict (operation_id) do update set
  previous_enforce_grants = excluded.previous_enforce_grants,
  enforce_grants = excluded.enforce_grants,
  changed_at = excluded.changed_at;

do $$
declare
  v_table record;
begin
  for v_table in
    select schema_name, table_name
    from public.hugo_rollback_gate_tables
  loop
    if to_regclass(format('%I.%I', v_table.schema_name, v_table.table_name)) is not null then
      execute format(
        'drop policy if exists hugo_rollback_fail_closed on %I.%I',
        v_table.schema_name,
        v_table.table_name
      );
    end if;
  end loop;
end;
$$;
drop policy if exists hugo_rollback_fail_closed on storage.objects;

drop table public.hugo_rollback_quarantine_access_settings;
drop table public.hugo_rollback_quarantine_enforcement_changes;
drop table public.hugo_rollback_gate_tables;

commit;

\echo 'Hugo rollback pause finalized. Target migrations are replayed and authenticated access gate is restored.'
