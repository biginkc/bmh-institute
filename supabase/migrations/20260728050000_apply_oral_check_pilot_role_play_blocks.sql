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
-- no-op-succeeded whenever no release record existed for
-- bmh-employee-training-v1, on the theory that a fresh/local/test database
-- genuinely has none. That is true, but it also meant a wrong deploy
-- target, an incomplete restore, or a catalog reloaded after migration
-- replay could ALL produce a green `supabase db push` while the pilot
-- silently never applied -- and because Supabase's migration tracking only
-- ever records a version as applied after it SUCCEEDS, a silent no-op
-- "success" would never be retried or flagged. Round 5 fixed that by
-- raising unconditionally whenever the release was absent.
--
-- ROUND-6 REVIEW, FINDING 2: that unconditional raise was too blunt and
-- broke something real. This file ships in supabase/migrations/, so EVERY
-- replay of the migration history against a clean database runs it:
-- `supabase db reset` locally, a CI validation run, a fresh preview or test
-- Supabase project. A clean database has no release record by definition,
-- so the round-5 version aborted all of them permanently -- and the only
-- reason CI stayed green at all was a hardcoded "skip this one file"
-- special case in run-controller-gate-pr-harness.mjs, which meant the
-- harness was no longer replaying the real migration set the way a real
-- environment does.
--
-- The two failure modes round 5 cared about and a genuinely clean database
-- are distinguishable, so this file now distinguishes them instead of
-- collapsing both into one raise:
--
--   * No release record AND no bmh-employee-training-v1 catalog at all
--     (no programs, courses, or lessons carrying that content_import_id):
--     this is a genuinely clean database that has never held this import.
--     There is nothing here to modify and nothing to be wrong about. Emit
--     a NOTICE and skip, so migration replay works everywhere.
--   * No release record BUT the catalog rows exist: this is exactly the
--     dangerous state round 5 was protecting against -- an incomplete
--     restore, a catalog reloaded after replay, or a target where the
--     import was applied but never released. Still raises (55000).
--   * Release record present: apply, as always.
--
-- What this deliberately gives up, and what covers it: a `supabase db push`
-- aimed at the wrong, completely empty Supabase project would now skip
-- quietly rather than raise. That case is covered at the operator layer
-- instead, where it can actually be detected -- a SQL migration cannot know
-- which project it is connected to. See the "Andrea Oral Check pilot
-- deployment" section of docs/course-production/import-runbook.md: the
-- target preflight proves the connection is Institute production
-- (dhvfsyteqsxagokoerrx) by querying the target for immutable production
-- facts BEFORE any write, and the mandatory receipt postflight verifies the
-- evidence row and the 3 blocks actually exist AFTER the push, rather than
-- trusting that the push reported success. A silent skip on the real
-- production target is impossible (production holds the catalog and the
-- release); a silent skip on an empty wrong target is caught by the
-- postflight.
--
-- Because this file is replay-safe again, run-controller-gate-pr-harness.mjs
-- no longer special-cases it: it is applied in the normal in-order sweep
-- like every other migration, and that sweep passing against a byte-fresh
-- cluster IS the proof of replay safety. supabase/tests/059_oral_check_pilot_apply_fail_closed.sql
-- \i's this EXACT, unmodified file three times on top of that -- against a
-- clean database (proving the skip is a real no-op that writes nothing),
-- against a catalog-without-release database (proving the fail-closed
-- refusal survives), and against a real populated fixture (proving it still
-- actually applies when the target is correct).
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
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  v_has_release boolean;
  v_has_catalog boolean;
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

  -- Round-5 review finding 1, as amended by round-6 review finding 2 (see
  -- the header): distinguish a genuinely clean database, where skipping is
  -- correct and required for migration replay to work at all, from a
  -- database that holds this catalog but has no release for it, which is
  -- the actual dangerous state and still fails closed.
  select exists (
    select 1 from public.content_import_release_records
    where import_id = v_import_id
  ) into v_has_release;

  select exists (
    select 1 from public.programs where content_import_id = v_import_id
    union all
    select 1 from public.courses where content_import_id = v_import_id
    union all
    select 1 from public.lessons where content_import_id = v_import_id
  ) into v_has_catalog;

  if not v_has_release then
    if v_has_catalog then
      raise exception 'Oral-check pilot forward apply refused: the % catalog exists on this database but has no published release record. This is the state that must never be applied through -- an incomplete restore, a catalog reloaded after migration replay, or an import that was applied but never released. Investigate the target before retrying; do not loosen this check. See docs/course-production/import-runbook.md.',
        v_import_id
        using errcode = '55000';
    end if;

    raise notice 'Oral-check pilot forward apply skipped: this database holds no % catalog and no release record for it, so there is nothing for this one-shot pilot insertion to modify. This is the expected outcome of replaying the migration history against a clean database (supabase db reset, CI, a fresh preview or test project). On the real production target the catalog and release both exist, so this branch is unreachable there, and the runbook''s mandatory receipt postflight verifies that for every real apply.',
      v_import_id;
    return;
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.fn_insert_oral_check_pilot_role_play_blocks();
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;
