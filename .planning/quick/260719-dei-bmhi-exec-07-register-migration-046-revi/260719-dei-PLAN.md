---
quick_task: 260719-dei
title: BMHI-EXEC-07 register migration 046 reviewer option fixture dependencies
type: execute
autonomous: true
branch: codex/institute-complete-course-v1
base_commit: 189a541
files_modified:
  - supabase/migrations/047_register_reviewer_answer_option_fixture_dependencies.sql
  - scripts/fixture-boundary/run-controller-gate-pr-harness.mjs
must_haves:
  truths:
    - Migration 046 remains unchanged because it is already applied to TEST.
    - The fixture cleanup contract recognizes every migration 046 foreign key into a fixture catalog table: answer_option_id to answer_options, program_id to programs, and question_id to questions.
    - A genuinely unregistered foreign key still makes cleanup fail closed with the unknown foreign key error.
    - The full migration stack and controller-gate destructive harness pass from scratch on local PostgreSQL, or the report states BLOCKED-CONTAINERS when PostgreSQL cannot start.
    - Migration 047 is applied to TEST and remote migration history confirms 046 and 047 in order.
    - All work remains uncommitted.
  artifacts:
    - path: supabase/migrations/047_register_reviewer_answer_option_fixture_dependencies.sql
      provides: Additive dependency-only table and scalar FK registration for migration 046
    - path: scripts/fixture-boundary/run-controller-gate-pr-harness.mjs
      provides: Focused registered-edge and adversarial unknown-FK regression proof
---

# BMHI-EXEC-07 register migration 046 reviewer option fixture dependencies

## Goal

Restore from-scratch controller-gate validation without weakening the cleanup boundary. Register all migration 046 catalog dependencies through additive migration 047 and preserve rejection of every unregistered FK.

## Test strategy

Use the real controller-gate harness. First assert the exact migration 047 registry rows. Then introduce a disposable unregistered public FK and prove the destructive cleanup refuses it with the expected unknown-FK message before removing the probe and running the normal destructive path successfully.

## Tasks

1. Add migration 047. Follow the dependency-only registration pattern from migrations 034 and 039: register `course_import_reviewer_answer_options_v1` with zero expected fixture rows and insert the three scalar catalog references for `answer_option_id`, `program_id`, and `question_id` with idempotent conflict handling plus an exact postcondition check. Do not amend migration 046.
2. Extend `run-controller-gate-pr-harness.mjs` with focused assertions for all three registered edges and an adversarial disposable unknown FK that must produce the existing fail-closed error. Remove the probe and run `LC_ALL=C npm run cleanup:fixtures:test-db-gate` from a fresh local cluster so the complete migration stack, destructive test, isolated contract test, hosted test, and disable path all pass. If PostgreSQL cannot start in the sandbox, report `BLOCKED-CONTAINERS` and leave the host run to Claude.
3. Apply migration 047 to the authorized TEST project only. Verify remote migration history shows 046 then 047 and query the TEST registry for the exact three rows. Review `git diff` and `git status` to confirm 046 is untouched, no production target was used, and all changes remain uncommitted.

## Final gate

Report the files changed, focused fail-closed result, full harness result, TEST apply and history evidence, and uncommitted status. Return DONE only when every available gate passes. Otherwise return BLOCKED with the exact reason.
