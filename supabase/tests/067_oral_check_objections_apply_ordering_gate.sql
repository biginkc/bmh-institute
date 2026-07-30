begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- 20260730061000_apply_objection_oral_check_role_play_blocks.sql must never
-- invoke the forward insertion without first confirming the rollback
-- capability (20260730060500) is actually installed -- that assertion is
-- what makes the deployment order self-enforcing at the SQL level, not just
-- a runbook convention. Prove this for real: temporarily remove the rollback
-- capability (inside a savepoint that gets rolled back), then replay the
-- EXACT, unmodified migration file -- not a hand-copied approximation of its
-- logic -- and confirm it refuses closed with SQLSTATE 55000 instead of
-- silently reaching the insert.
--
-- The second section proves the SAME missing-rollback-capability scenario is
-- ALSO refused when fn_insert_oral_check_objections_role_play_blocks() is
-- called directly, bypassing the apply migration entirely -- the exposed
-- call path that would otherwise open the instant 20260730060000 commits.
--
-- Mirrors supabase/tests/058_oral_check_pilot_apply_ordering_gate.sql.
do $$
begin
  if to_regprocedure('public.fn_insert_oral_check_objections_role_play_blocks()') is null then
    raise exception '20260730060000 has not been applied -- this test must run after the full migration set, not standalone';
  end if;
  if to_regprocedure('public.fn_rollback_oral_check_objections_role_play_blocks()') is null then
    raise exception '20260730060500 has not been applied -- this test must run after the full migration set, not standalone';
  end if;
end;
$$;

savepoint before_missing_rollback_capability;
do $$
begin
  drop function public.fn_rollback_oral_check_objections_role_play_blocks();
  drop table public.content_import_oral_check_objections_rollback_records;
end;
$$;

do $$
begin
  if to_regprocedure('public.fn_rollback_oral_check_objections_role_play_blocks()') is not null
    or to_regclass('public.content_import_oral_check_objections_rollback_records') is not null
  then
    raise exception 'the rollback capability removal for this rehearsal did not actually take effect';
  end if;
end;
$$;

-- Replay the real migration file with ON_ERROR_STOP off so this script can
-- capture and assert on the failure instead of aborting the whole test run --
-- the failure IS the expected, correct outcome here.
\set ON_ERROR_STOP off
\i supabase/migrations/20260730061000_apply_objection_oral_check_role_play_blocks.sql
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
-- dollar-quoted plpgsql body.
select set_config('bmh.test_067_captured_sqlstate', :'apply_migration_sqlstate', true);
select set_config('bmh.test_067_captured_message', :'apply_migration_message', true);

do $$
declare
  v_sqlstate text := current_setting('bmh.test_067_captured_sqlstate', true);
  v_message text := current_setting('bmh.test_067_captured_message', true);
begin
  if v_sqlstate <> '55000' then
    raise exception 'expected the apply migration to refuse with SQLSTATE 55000 when the rollback capability is missing, got sqlstate=% message=%',
      v_sqlstate, v_message;
  end if;
  if position('rollback capability' in v_message) = 0 then
    raise exception 'the apply migration failed for the wrong reason: %', v_message;
  end if;
  if to_regprocedure('public.fn_rollback_oral_check_objections_role_play_blocks()') is null
    or to_regclass('public.content_import_oral_check_objections_rollback_records') is null
  then
    raise exception 'savepoint rollback did not restore the rollback capability for later tests in this suite';
  end if;
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
  ) then
    raise exception 'the apply migration inserted the objections oral-check blocks despite refusing on the missing rollback capability';
  end if;
end;
$$;

-- The ordering gate above only protects the APPLY MIGRATION's own wrapper
-- invocation. fn_insert_oral_check_objections_role_play_blocks() itself would
-- otherwise be directly callable -- by a raw RPC, a direct SQL session,
-- anything holding service_role -- the instant 20260730060000 committed,
-- regardless of whether the rollback capability existed yet. Prove that
-- direct call path is ALSO refused: simulate "only 20260730060000 has been
-- applied" the same way as above, then call the insertion function DIRECTLY,
-- not through the apply migration file at all.
savepoint before_direct_call_missing_rollback;
do $$
begin
  drop function public.fn_rollback_oral_check_objections_role_play_blocks();
  drop table public.content_import_oral_check_objections_rollback_records;
end;
$$;

do $$
begin
  if to_regprocedure('public.fn_rollback_oral_check_objections_role_play_blocks()') is not null
    or to_regclass('public.content_import_oral_check_objections_rollback_records') is not null
  then
    raise exception 'the rollback capability removal for this rehearsal did not actually take effect';
  end if;
  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'a DIRECT call to fn_insert_oral_check_objections_role_play_blocks() succeeded despite the missing rollback capability -- the apply migration''s own wrapper check is not the only call path';
  exception when sqlstate '55000' then
    if sqlerrm not like '%rollback capability%' then raise; end if;
  end;
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
  ) then
    raise exception 'the refused direct call left content blocks behind';
  end if;
end;
$$;
rollback to savepoint before_direct_call_missing_rollback;

-- The in-body rollback-capability assertion must fire BEFORE the auth check
-- is the only thing standing between a caller and the catalog, but it must
-- NOT be reachable at all by a non-service_role caller: authorization is
-- still checked first. Confirm the ordering is auth-then-capability, so a
-- learner-shaped caller never learns anything about deployment state.
savepoint before_auth_precedence;
do $$
begin
  drop function public.fn_rollback_oral_check_objections_role_play_blocks();
  drop table public.content_import_oral_check_objections_rollback_records;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'an authenticated caller reached the insertion function at all';
  exception when sqlstate '42501' then
    if sqlerrm not like '%requires service_role%' then
      raise exception 'an authenticated caller was refused for the wrong reason (expected the service_role check to fire first): %', sqlerrm;
    end if;
  end;
  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$$;
rollback to savepoint before_auth_precedence;

rollback;
