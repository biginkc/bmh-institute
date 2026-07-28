-- Performs the actual, live forward invocation of
-- fn_insert_oral_check_pilot_role_play_blocks() -- split out from
-- 20260728020000_insert_oral_check_pilot_role_play_blocks.sql in round-4
-- Codex review (PR #130, finding 1), then hardened again in round-5 review
-- (finding 1) after this file's own original design turned out to have a
-- second silent-failure mode.
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
-- rollback. Splitting the self-invoking insert out into this file, numbered
-- after BOTH 20260728020000 and 20260728030000, and asserting the rollback
-- capability actually exists before ever calling the insert function, makes
-- that incident state structurally unreachable through the normal
-- migration-application order. (Round-5 review, finding 2, additionally
-- moved that same assertion INSIDE fn_insert_oral_check_pilot_role_play_blocks()
-- itself -- see 20260728020000 -- so a direct call to that function,
-- bypassing this file entirely, fails closed the same way. This file's own
-- preflight checks below are now a redundant, defense-in-depth second
-- layer, not the only layer.)
--
-- ROUND-5 REVIEW, FINDING 1: this file's ORIGINAL design silently
-- no-op-succeeded when no release record existed for
-- bmh-employee-training-v1, on the theory that a fresh/local/test database
-- genuinely has none. That is true, but it also meant a wrong deploy
-- target, an incomplete restore, or a catalog reloaded after migration
-- replay could ALL produce a green `supabase db push` while the pilot
-- silently never applied -- and because Supabase's migration tracking only
-- ever records a version as applied after it SUCCEEDS, a silent no-op
-- "success" would never be retried or flagged. Fixed: this file now fails
-- CLOSED (raises) whenever the exact release is absent, full stop, no
-- no-op case. This is the deliberately correct behavior for this file's
-- actual real-world use (applying it to the genuine, already-released
-- Institute production catalog, where the release record always exists) --
-- it is NEVER correct for this exact file to succeed silently doing
-- nothing.
--
-- Consequence for local/test tooling: because this file now genuinely
-- fails on a database with no release record, it CANNOT be included in the
-- controller-gate harness's blanket "apply every migration file in order"
-- sweep the way every other migration in this repo is (that sweep runs
-- against a byte-fresh cluster with no release record at all, and this
-- file failing there would abort every other test in the suite). See
-- run-controller-gate-pr-harness.mjs, which explicitly skips this one file
-- during that sweep, and
-- supabase/tests/059_oral_check_pilot_apply_fail_closed.sql, which \i's
-- this EXACT, unmodified file twice instead -- once against a genuinely
-- empty database (proving the fail-closed refusal) and once against a real
-- populated fixture (proving it still actually works when the target is
-- correct).
--
-- This file makes no schema changes of its own -- it only asserts
-- preconditions and performs the same guarded, idempotent-refusing
-- invocation 20260728020000 used to perform directly. See also
-- docs/course-production/import-runbook.md's "Andrea Oral Check pilot
-- deployment" section for the full deploy sequence, including the target
-- preflight and receipt postflight this migration alone cannot enforce
-- (a SQL migration has no way to know which Supabase project it is
-- connected to -- that is an operator/CLI-level fact, not a database fact).

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

  -- Round-5 review, finding 1: fail CLOSED, unconditionally, when the
  -- exact release is absent -- never silently no-op succeed. There is no
  -- legitimate scenario, for THIS specific file applied to THIS specific
  -- import, where the release genuinely should be missing; if it is,
  -- something about the target or the restore is wrong and a real
  -- deployment must stop and be investigated, not quietly report success.
  if not exists (
    select 1 from public.content_import_release_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'Oral-check pilot forward apply refused: no published release record exists for bmh-employee-training-v1. This migration must never silently no-op -- if this is the genuine Institute production target, something is wrong (incomplete restore, wrong project, catalog not yet released) and must be investigated before retrying. If this is intentionally a fresh/local/test database, this migration must not be applied here at all -- see docs/course-production/import-runbook.md.'
      using errcode = '55000';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.fn_insert_oral_check_pilot_role_play_blocks();
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;
