-- MANUAL ONLY. This is not a Supabase migration and must never be copied
-- into supabase/migrations or run by `supabase db push`.
--
-- This artifact prepares a reversible rollback pause for the four Hugo
-- hardening migrations. It quarantines only the two tables introduced by
-- 20260728230000, restores the pre-hardening functions by replaying the two
-- reviewed predecessor migrations, removes the four migration-history rows,
-- and leaves a deny-all RLS gate installed. The gate is removed only by
-- replay-finalize.sql after all four migrations have been replayed and
-- verified. No identity, grant, role-group, or business row is deleted.
--
-- The operator must set the confirmation GUC in the same psql session before
-- including this file:
--   select set_config('bmh.hugo_rollback_confirm',
--                     'I_UNDERSTAND_MANUAL_ONLY', false);
--   select set_config('bmh.hugo_rollback_quiesced',
--                     'I_UNDERSTAND_WRITERS_STOPPED', false);

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('bmh.hugo_rollback_confirm', true)
       is distinct from 'I_UNDERSTAND_MANUAL_ONLY' then
    raise exception
      'Hugo rollback is manual-only; set bmh.hugo_rollback_confirm in this session.'
      using errcode = '42501';
  end if;
  if current_setting('bmh.hugo_rollback_quiesced', true)
       is distinct from 'I_UNDERSTAND_WRITERS_STOPPED' then
    raise exception
      'Hugo rollback requires external writer quiescence; stop Hugo/Auth workers and set bmh.hugo_rollback_quiesced in this session.'
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
begin
  select count(*) into v_count
  from supabase_migrations.schema_migrations
  where version = any (array[
    '20260728230000', '20260728235900',
    '20260729001500', '20260729003000'
  ]::text[]);
  if v_count <> 4 then
    raise exception
      'Hugo rollback requires all four target migration history rows; found %.',
      v_count
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
    raise exception
      'Hugo rollback requires canonical target migration names and hashes; refusing any DDL.'
      using errcode = '55000';
  end if;

  if to_regclass('public.hugo_access_settings') is null
     or to_regclass('public.hugo_access_enforcement_changes') is null then
    raise exception
      'Hugo rollback target tables are missing; refusing a partial rollback.'
      using errcode = '55000';
  end if;

  if to_regclass('public.hugo_rollback_gate_tables') is not null
     or to_regclass('public.hugo_rollback_quarantine_access_settings') is not null
     or to_regclass('public.hugo_rollback_quarantine_enforcement_changes') is not null then
    raise exception
      'A previous Hugo rollback pause is still present; finish or reconcile it first.'
      using errcode = '55000';
  end if;
end;
$$;

-- Record the exact pre-existing RLS surface. The deny policy is retained after
-- commit so an operator can safely inspect and replay the pending migrations.
create table public.hugo_rollback_gate_tables (
  schema_name text not null,
  table_name text not null,
  relacl aclitem[],
  primary key (schema_name, table_name)
);
insert into public.hugo_rollback_gate_tables (schema_name, table_name, relacl)
select namespace.nspname, relation.relname, relation.relacl
from pg_catalog.pg_class relation
join pg_catalog.pg_namespace namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p')
  and relation.relrowsecurity;
revoke all on table public.hugo_rollback_gate_tables
  from public, anon, authenticated, service_role;

do $$
declare
  v_table record;
begin
  for v_table in
    select schema_name, table_name
    from public.hugo_rollback_gate_tables
  loop
    execute format(
      'drop policy if exists hugo_rollback_fail_closed on %I.%I',
      v_table.schema_name,
      v_table.table_name
    );
    execute format(
      'create policy hugo_rollback_fail_closed on %I.%I as restrictive for all to authenticated using (false) with check (false)',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end;
$$;

drop policy if exists hugo_rollback_fail_closed on storage.objects;
create policy hugo_rollback_fail_closed
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- Remove the hardening policy before restoring the predecessor function
-- definitions. The deny-all gate above remains the only authenticated path.
do $$
declare
  v_table record;
begin
  for v_table in
    select schema_name, table_name
    from public.hugo_rollback_gate_tables
  loop
    execute format(
      'drop policy if exists hugo_active_authenticated_gate on %I.%I',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end;
$$;
drop policy if exists hugo_active_authenticated_gate on storage.objects;

-- Remove target-only triggers before replacing their function dependencies.
drop trigger if exists hugo_auth_users_lifecycle_lock on auth.users;
drop trigger if exists hugo_access_grants_final_owner_guard
  on public.hugo_access_grants;
drop trigger if exists hugo_access_grants_prevent_truncate
  on public.hugo_access_grants;
drop trigger if exists trg_prevent_last_owner_deletion on public.profiles;

-- The target tables are not dropped. Renaming them preserves every setting and
-- audit row so replay-finalize.sql can restore the exact prior contents.
alter table public.hugo_access_settings
  rename to hugo_rollback_quarantine_access_settings;
alter table public.hugo_access_enforcement_changes
  rename to hugo_rollback_quarantine_enforcement_changes;

-- The payload-hash migration's private wrappers must be absent before its
-- predecessor is replayed. The predecessor migration recreates them in the
-- exact historical order.
drop function if exists public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
);
drop function if exists public.hugo_prepare_pristine_delete(uuid, text);
drop function if exists public.hugo_delete_identity(uuid, text);
drop function if exists public.hugo_apply_access_unhashed(
  uuid, text, text, jsonb, text, timestamptz, text
);
drop function if exists public.hugo_prepare_pristine_delete_unhashed(uuid, text);
drop function if exists public.hugo_delete_identity_unhashed(uuid, text);

-- These functions and the Auth trigger were introduced or replaced only by
-- the four target migrations.
drop function if exists public.fn_hugo_email_has_durable_activity(text);
drop function if exists public.fn_hugo_lock_auth_user_insert_lifecycle();
drop function if exists public.fn_hugo_prevent_grant_truncate();
drop function if exists public.fn_hugo_prevent_last_usable_owner_grant();
drop function if exists public.hugo_set_access_enforcement(uuid, boolean);
drop function if exists public.fn_hugo_owner_is_usable(uuid);
drop function if exists public.fn_hugo_owner_has_nonexpiring_grant(uuid);
drop function if exists public.fn_hugo_grant_row_is_active(uuid);
drop function if exists public.fn_hugo_profile_reference_inventory(uuid);

-- The payload-hash constraint predates the target migrations but the
-- predecessor migration recreates it unconditionally. Remove only this
-- schema object so that replaying the exact predecessor is deterministic.
alter table public.hugo_access_operations
  drop constraint if exists hugo_access_operations_request_hash_format_check;

-- Reapply the reviewed pre-hardening definitions. These migrations use
-- CREATE OR REPLACE and guarded DDL only. They do not mutate identity,
-- connector, role-group, or business data.
\ir ../../supabase/migrations/20260728091000_hugo_access_provisioner.sql
\ir ../../supabase/migrations/20260728113000_hugo_access_operation_payload_hash.sql

-- 20260728230000 replaced this helper from migration 025. Keep its exact
-- pre-hardening authorization behavior while the deny gate is active.
create or replace function public.fn_can_read_user_state(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles actor
      where actor.id = auth.uid()
        and actor.status = 'active'
        and (
          p_user_id = actor.id
          or actor.system_role in ('owner', 'admin')
        )
    );
$$;
revoke all on function public.fn_can_read_user_state(uuid)
  from public, anon;
grant execute on function public.fn_can_read_user_state(uuid)
  to authenticated, service_role;

-- Persist a pause marker and reject every row write while the operator reviews
-- and replays the target stack. The marker is checked by a trigger rather than
-- relying only on RLS, because service_role commonly bypasses RLS.
create table public.hugo_rollback_pause (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now()
);
insert into public.hugo_rollback_pause (singleton)
values (true);
revoke all on table public.hugo_rollback_pause
  from public, anon, authenticated, service_role;

create or replace function public.fn_hugo_rollback_write_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.hugo_rollback_pause') is not null then
    raise exception
      'Hugo rollback pause is active; all identity and business writes are quiesced.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hugo_rollback_write_guard()
  from public, anon, authenticated, service_role;

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
        'drop trigger if exists hugo_rollback_write_guard on %I.%I; create trigger hugo_rollback_write_guard before insert or update or delete on %I.%I for each row execute function public.fn_hugo_rollback_write_guard()',
        v_table.schema_name, v_table.table_name,
        v_table.schema_name, v_table.table_name
      );
    end if;
  end loop;
end;
$$;
drop trigger if exists hugo_rollback_write_guard on auth.users;
create trigger hugo_rollback_write_guard
before insert or update or delete on auth.users
for each row execute function public.fn_hugo_rollback_write_guard();
drop trigger if exists hugo_rollback_write_guard on storage.objects;
create trigger hugo_rollback_write_guard
before insert or update or delete on storage.objects
for each row execute function public.fn_hugo_rollback_write_guard();

delete from supabase_migrations.schema_migrations
where version = any (array[
  '20260728230000', '20260728235900',
  '20260729001500', '20260729003000'
]::text[]);

commit;

\echo 'Hugo rollback pause committed. Authenticated access remains fail-closed.'
\echo 'Replay the four target migrations, then run replay-finalize.sql in the same manual-confirmation protocol.'
