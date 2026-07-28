begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- Round-4 review, finding 1: 20260728050000_apply_oral_check_pilot_role_play_blocks.sql
-- must never invoke the forward insertion without first confirming the
-- rollback capability (20260728030000) is actually installed -- that
-- assertion is what makes the deployment order self-enforcing at the SQL
-- level, not just a runbook convention. Prove this for real: temporarily
-- remove the rollback capability (inside a savepoint that gets rolled
-- back), then replay the EXACT, unmodified migration file -- not a
-- hand-copied approximation of its logic -- and confirm it refuses closed
-- with SQLSTATE 55000 instead of silently reaching the insert.
do $$
begin
  if to_regprocedure('public.fn_insert_oral_check_pilot_role_play_blocks()') is null then
    raise exception '20260728020000 has not been applied -- this test must run after the full migration set, not standalone';
  end if;
  if to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()') is null then
    raise exception '20260728030000 has not been applied -- this test must run after the full migration set, not standalone';
  end if;
end;
$$;

savepoint before_missing_rollback_capability;
do $$
begin
  drop function public.fn_rollback_oral_check_pilot_role_play_blocks();
  drop table public.content_import_oral_check_pilot_role_play_rollback_records;
end;
$$;

do $$
begin
  if to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()') is not null
    or to_regclass('public.content_import_oral_check_pilot_role_play_rollback_records') is not null
  then
    raise exception 'the rollback capability removal for this rehearsal did not actually take effect';
  end if;
end;
$$;

-- Replay the real migration file with ON_ERROR_STOP off so this script can
-- capture and assert on the failure instead of aborting the whole test
-- run -- the failure IS the expected, correct outcome here.
\set ON_ERROR_STOP off
\i supabase/migrations/20260728050000_apply_oral_check_pilot_role_play_blocks.sql
\set ON_ERROR_STOP on

-- Capture psql's client-side error variables into our own psql variables
-- BEFORE running any further (successful) statement -- a successful
-- statement resets LAST_ERROR_SQLSTATE/LAST_ERROR_MESSAGE back to "no
-- error". This is a pure client-side capture (no server round-trip), so it
-- is safe to do even while the transaction is in the aborted state the
-- failed \i left it in.
\set apply_migration_sqlstate :LAST_ERROR_SQLSTATE
\set apply_migration_message :LAST_ERROR_MESSAGE

-- ROLLBACK TO SAVEPOINT is the recovery path even from an aborted
-- transaction block -- restores the dropped rollback capability too.
rollback to savepoint before_missing_rollback_capability;

-- Bridge the captured psql variables into the server via set_config/
-- current_setting rather than substituting :'psql_var' directly inside a
-- dollar-quoted plpgsql body -- the well-established, unambiguous pattern
-- for getting a client-side psql value into a function body, avoiding any
-- question about how psql's :'var' substitution interacts with $$...$$
-- dollar-quoting.
select set_config('bmh.test_058_captured_sqlstate', :'apply_migration_sqlstate', true);
select set_config('bmh.test_058_captured_message', :'apply_migration_message', true);

do $$
declare
  v_sqlstate text := current_setting('bmh.test_058_captured_sqlstate', true);
  v_message text := current_setting('bmh.test_058_captured_message', true);
begin
  if v_sqlstate <> '55000' then
    raise exception 'expected the apply migration to refuse with SQLSTATE 55000 when the rollback capability is missing, got sqlstate=% message=%',
      v_sqlstate, v_message;
  end if;
  if position('rollback capability' in v_message) = 0 then
    raise exception 'the apply migration failed for the wrong reason: %', v_message;
  end if;
  if to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()') is null
    or to_regclass('public.content_import_oral_check_pilot_role_play_rollback_records') is null
  then
    raise exception 'savepoint rollback did not restore the rollback capability for later tests in this suite';
  end if;
  if exists (
    select 1 from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) then
    raise exception 'the apply migration inserted the oral-check blocks despite refusing on the missing rollback capability';
  end if;
end;
$$;

rollback;
