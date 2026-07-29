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
  if current_setting('bmh.hugo_rollback_quiesced', true)
       is distinct from 'I_UNDERSTAND_WRITERS_STOPPED' then
    raise exception
      'Hugo replay finalization requires external writer quiescence; keep Hugo/Auth workers stopped and set bmh.hugo_rollback_quiesced in this session.'
      using errcode = '55000';
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
  v_trigger_oid oid;
  v_trigger_definition text;
  v_authenticated_oid oid;
  v_policy_count integer;
  v_qual text;
  v_with_check text;
  v_table record;
begin
  if to_regclass('public.hugo_rollback_gate_tables') is null
     or to_regclass('public.hugo_rollback_quarantine_access_settings') is null
     or to_regclass('public.hugo_rollback_quarantine_enforcement_changes') is null
     or to_regclass('public.hugo_rollback_pause') is null then
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
  if position(
       'fn_hugo_has_durable_activity'
       in pg_get_functiondef(
         'public.fn_hugo_email_has_durable_activity(text)'::regprocedure
       )
     ) = 0
     or position(
       'hugo-institute-privileged-lifecycle-v1'
       in pg_get_functiondef(
         'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure
       )
     ) = 0 then
    raise exception 'Hugo target function bodies do not match the canonical hardening signatures; deny gate remains active.'
      using errcode = '55000';
  end if;

  select trigger_row.tgtype, trigger_row.tgfoid,
    pg_get_triggerdef(trigger_row.oid)
  into v_trigger_type, v_trigger_oid, v_trigger_definition
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = 'auth.users'::regclass
    and trigger_row.tgname = 'hugo_auth_users_lifecycle_lock'
    and not trigger_row.tgisinternal
    and trigger_row.tgfoid =
      'public.fn_hugo_lock_auth_user_insert_lifecycle()'::regprocedure;
  if v_trigger_type is distinct from 22
     or v_trigger_oid is null
     or position('before insert or update of email on auth.users' in lower(v_trigger_definition)) = 0 then
    raise exception
      'Hugo Auth email lifecycle trigger is not the expected BEFORE INSERT OR UPDATE OF email statement trigger.'
      using errcode = '55000';
  end if;

  select oid into v_authenticated_oid
  from pg_catalog.pg_roles
  where rolname = 'authenticated';
  if v_authenticated_oid is null then
    raise exception 'Authenticated database role is missing; deny gate remains active.'
      using errcode = '55000';
  end if;

  for v_table in
    select schema_name, table_name
    from public.hugo_rollback_gate_tables
  loop
    if not coalesce((
      select relation.relrowsecurity
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = v_table.schema_name
        and relation.relname = v_table.table_name
        and relation.relkind in ('r', 'p')
    ), false) then
      raise exception 'RLS is not enabled on %.%; deny gate remains active.',
        v_table.schema_name, v_table.table_name
        using errcode = '55000';
    end if;

    select count(*),
      max(regexp_replace(lower(pg_get_expr(policy_row.polqual, policy_row.polrelid)), '\s+', '', 'g')),
      max(regexp_replace(lower(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid)), '\s+', '', 'g'))
    into v_policy_count, v_qual, v_with_check
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = format('%I.%I', v_table.schema_name, v_table.table_name)::regclass
      and policy_row.polname = 'hugo_active_authenticated_gate'
      and not policy_row.polpermissive
      and policy_row.polroles = array[v_authenticated_oid]::oid[];
    if v_policy_count <> 1
       or v_qual is null
       or position('fn_hugo_access_is_active(auth.uid())' in v_qual) = 0
       or v_with_check is null
       or position('fn_hugo_access_is_active(auth.uid())' in v_with_check) = 0 then
      raise exception 'Hugo active-access policy coverage drifted on %.%; deny gate remains active.',
        v_table.schema_name, v_table.table_name
        using errcode = '55000';
    end if;
  end loop;

  if not coalesce((
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and relation.relkind in ('r', 'p')
  ), false) then
    raise exception 'RLS is not enabled on storage.objects; deny gate remains active.'
      using errcode = '55000';
  end if;
  select count(*),
    max(regexp_replace(lower(pg_get_expr(policy_row.polqual, policy_row.polrelid)), '\s+', '', 'g')),
    max(regexp_replace(lower(pg_get_expr(policy_row.polwithcheck, policy_row.polrelid)), '\s+', '', 'g'))
  into v_policy_count, v_qual, v_with_check
  from pg_catalog.pg_policy policy_row
  where policy_row.polrelid = 'storage.objects'::regclass
    and policy_row.polname = 'hugo_active_authenticated_gate'
    and not policy_row.polpermissive
    and policy_row.polroles = array[v_authenticated_oid]::oid[];
  if v_policy_count <> 1
     or v_qual is null
     or position('fn_hugo_access_is_active(auth.uid())' in v_qual) = 0
     or v_with_check is null
     or position('fn_hugo_access_is_active(auth.uid())' in v_with_check) = 0 then
    raise exception 'Hugo active-access policy coverage drifted on storage.objects; deny gate remains active.'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260728230000'
      and (statements is distinct from array['sha256:2b13e9f511a3cb3a2797174c9e7b37beb9eb00cd79b55318d2bfa997a6e229c8']
        or name is distinct from 'hugo_access_authorization_hardening')
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260728235900'
      and (statements is distinct from array['sha256:00a9403de2a3357094798e9a9bd22c1604666e68286e5fb01962f65a64623d51']
        or name is distinct from 'hugo_missing_identity_durable_proof')
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260729001500'
      and (statements is distinct from array['sha256:41b3a810997ea932f1e6046e1b353829383789581b3762551d809dd3654a82d8']
        or name is distinct from 'hugo_auth_insert_lifecycle_lock')
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260729003000'
      and (statements is distinct from array['sha256:090addb4f9c8cd5d109a84b05a8db59d60233ed333d90fb689223da4830c8c70']
        or name is distinct from 'hugo_auth_email_lifecycle_lock')
  ) then
    raise exception 'Hugo migration history does not contain the canonical replay hashes; deny gate remains active.'
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

-- DDL locks these tables until commit, so the pause trigger can be removed for
-- the exact restore below without opening a concurrent writer window.
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
        'drop trigger if exists hugo_rollback_write_guard on %I.%I',
        v_table.schema_name, v_table.table_name
      );
    end if;
  end loop;
end;
$$;
drop trigger if exists hugo_rollback_write_guard on auth.users;
drop trigger if exists hugo_rollback_write_guard on storage.objects;

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
begin
  if exists (
    select * from public.hugo_access_settings
    except
    select * from public.hugo_rollback_quarantine_access_settings
  ) or exists (
    select * from public.hugo_rollback_quarantine_access_settings
    except
    select * from public.hugo_access_settings
  ) or exists (
    select * from public.hugo_access_enforcement_changes
    except
    select * from public.hugo_rollback_quarantine_enforcement_changes
  ) or exists (
    select * from public.hugo_rollback_quarantine_enforcement_changes
    except
    select * from public.hugo_access_enforcement_changes
  ) then
    raise exception
      'Hugo replay target state drifted during the pause; deny gate remains active.'
      using errcode = '55000';
  end if;
end;
$$;

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
drop function public.fn_hugo_rollback_write_guard();
drop table public.hugo_rollback_pause;

commit;

\echo 'Hugo rollback pause finalized. Target migrations are replayed and authenticated access gate is restored.'
