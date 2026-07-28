-- Performs the actual, live forward invocation of
-- fn_insert_oral_check_pilot_role_play_blocks() -- split out from
-- 20260728020000_insert_oral_check_pilot_role_play_blocks.sql in round-4
-- Codex review (PR #130, finding 1).
--
-- Why this is a separate, later-numbered migration: Supabase applies each
-- migration file as its own transactional batch. The original design had
-- 20260728020000 both DEFINE fn_insert_oral_check_pilot_role_play_blocks()
-- AND self-invoke it in the same file, before
-- 20260728030000_rollback_oral_check_pilot_role_play_blocks.sql (installing
-- the rollback capability) had even been written as a migration file. That
-- meant a real deployment could commit the live insertion in 20260728020000
-- and then fail, stop, or never reach 20260728030000 -- leaving the 3
-- published required blocks live in production with zero prepared
-- rollback, which is exactly the incident state round-3's finding 3 (the
-- rollback capability itself) was built to eliminate. Splitting the
-- self-invoking insert out into this file, numbered after BOTH
-- 20260728020000 (the insert function) and 20260728030000 (the rollback
-- function), and asserting the rollback capability actually exists before
-- ever calling the insert function, makes that incident state structurally
-- unreachable through the normal migration-application order: by the time
-- this file can run at all, the rollback capability has already committed
-- in an earlier, already-applied migration.
--
-- This file makes no schema changes of its own -- it only asserts
-- preconditions and performs the same guarded, idempotent-refusing
-- invocation 20260728020000 used to perform directly. On a fresh/local
-- database with no bmh-employee-training-v1 release record at all, this is
-- a no-op: the function raises before ever reaching the insert, which the
-- local test harness handles by building a matching minimal fixture first
-- (see supabase/tests/056_oral_check_pilot_role_play_blocks.sql) rather
-- than expecting this bare `do` block to succeed against an empty
-- database. See also docs/course-production/import-runbook.md's "Andrea
-- Oral Check pilot deployment" section for the full deploy sequence.

do $$
begin
  if to_regclass('public.content_import_oral_check_pilot_role_play_rollback_records') is null
    or to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()') is null
  then
    raise exception 'Oral-check pilot forward apply refused: the rollback capability (content_import_oral_check_pilot_role_play_rollback_records / fn_rollback_oral_check_pilot_role_play_blocks) is not installed. This migration must never invoke the forward insertion without a prepared rollback path already in place -- see this file''s header comment and PR #130 round-4 review finding 1.'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.fn_insert_oral_check_pilot_role_play_blocks()') is null then
    raise exception 'Oral-check pilot forward apply refused: fn_insert_oral_check_pilot_role_play_blocks() is not installed.'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.content_import_release_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform public.fn_insert_oral_check_pilot_role_play_blocks();
    perform set_config('request.jwt.claim.role', '', true);
  end if;
end;
$$;
