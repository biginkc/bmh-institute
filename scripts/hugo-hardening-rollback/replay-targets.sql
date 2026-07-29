-- MANUAL ONLY. Replay the four target migrations atomically and bind each
-- history row to the canonical SQL hash expected by replay-finalize.sql.
-- This file is intentionally outside supabase/migrations.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('bmh.hugo_rollback_confirm', true)
       is distinct from 'I_UNDERSTAND_MANUAL_ONLY' then
    raise exception
      'Hugo target replay is manual-only; set bmh.hugo_rollback_confirm in this session.'
      using errcode = '42501';
  end if;
  if current_setting('bmh.hugo_rollback_quiesced', true)
       is distinct from 'I_UNDERSTAND_WRITERS_STOPPED' then
    raise exception
      'Hugo target replay requires external writer quiescence; set bmh.hugo_rollback_quiesced in this session.'
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
begin
  if to_regclass('public.hugo_rollback_gate_tables') is null
     or to_regclass('public.hugo_rollback_quarantine_access_settings') is null
     or to_regclass('public.hugo_rollback_quarantine_enforcement_changes') is null then
    raise exception 'Hugo rollback pause is missing; refusing target replay.'
      using errcode = '55000';
  end if;
end;
$$;

\ir ../../supabase/migrations/20260728230000_hugo_access_authorization_hardening.sql
insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20260728230000',
  array['sha256:2b13e9f511a3cb3a2797174c9e7b37beb9eb00cd79b55318d2bfa997a6e229c8'],
  'hugo_access_authorization_hardening'
);

\ir ../../supabase/migrations/20260728235900_hugo_missing_identity_durable_proof.sql
insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20260728235900',
  array['sha256:00a9403de2a3357094798e9a9bd22c1604666e68286e5fb01962f65a64623d51'],
  'hugo_missing_identity_durable_proof'
);

\ir ../../supabase/migrations/20260729001500_hugo_auth_insert_lifecycle_lock.sql
insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20260729001500',
  array['sha256:41b3a810997ea932f1e6046e1b353829383789581b3762551d809dd3654a82d8'],
  'hugo_auth_insert_lifecycle_lock'
);

\ir ../../supabase/migrations/20260729003000_hugo_auth_email_lifecycle_lock.sql
insert into supabase_migrations.schema_migrations (version, statements, name)
values (
  '20260729003000',
  array['sha256:090addb4f9c8cd5d109a84b05a8db59d60233ed333d90fb689223da4830c8c70'],
  'hugo_auth_email_lifecycle_lock'
);

-- Keep the committed pause effective for the two target tables recreated by
-- 20260728230000. replay-finalize.sql drops these guards only while holding
-- the transaction/advisory lock and before removing the deny gate.
drop trigger if exists hugo_rollback_write_guard on public.hugo_access_settings;
create trigger hugo_rollback_write_guard
before insert or update or delete on public.hugo_access_settings
for each row execute function public.fn_hugo_rollback_write_guard();
drop trigger if exists hugo_rollback_write_guard on public.hugo_access_enforcement_changes;
create trigger hugo_rollback_write_guard
before insert or update or delete on public.hugo_access_enforcement_changes
for each row execute function public.fn_hugo_rollback_write_guard();

commit;

\echo 'Hugo target migrations replayed atomically with canonical history hashes.'
