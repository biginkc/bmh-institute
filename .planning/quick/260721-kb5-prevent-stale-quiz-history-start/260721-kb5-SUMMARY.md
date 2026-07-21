---
quick_task: 260721-kb5
status: human_needed
code_commits:
  - b2f61fa
  - d7f9afb
blocked_by:
  - exact-head Claude approval and production browser verification
completed_date: 2026-07-21
---

# Prevent stale quiz start after browser history return summary

## Implemented

- Reproduced the production failure in the credentialed TEST real-Next E2E before changing code: after pass, result Back to course, Back to dashboard, and browser Back twice, the lesson restored `Ready for the checkpoint` instead of `Passed`.
- Confirmed production persistence was correct and the defect was Next App Router Client Cache reuse: a hard reload rendered the server Passed gate.
- Changed the result-card, standalone quiz header, composite quiz header, composite next-lesson exit, and composite progress-rail destinations to cross a full-document boundary where quiz state can otherwise be stale.
- Added a completed-result click boundary that converts ordinary unmodified same-origin shell links into full document navigation while preserving modified clicks, downloads, external destinations, explicit alternate targets, and same-page hashes.
- Added a temporary completed-result document marker so keyboard lesson-search navigation uses the same hard boundary instead of `router.push`.
- Kept non-quiz lesson navigation on Next Link and preserved immediate result-card focus without restoring `router.refresh` or action-time `revalidatePath`.
- Added action-level tests proving stale starts after pass or exhausted attempts are rejected before insertion.

## TDD and real-stack evidence

- RED: the first TEST Playwright history assertion failed at the expected Passed heading after browser Back restored the stale Start state; setup passed and cleanup ran.
- GREEN: the corrected result-to-course-to-dashboard-to-Back-twice flow passed against the real Next server and canonical TEST Supabase project.
- GREEN: the stronger shell test clicked the always-visible Dashboard Next Link from the immediate focused Passed result, observed a real document request, went Back, and found Passed with zero Start or Retake controls.
- Final focused TEST run passed setup plus both Chromium flows, 3 of 3 in 59.2 seconds; both disposable fixtures cleaned in `finally`.
- Focused source/server coverage passed 32 of 32; focused runner/search RTL passed 22 of 22.
- Full repository verification passed: typecheck, 155 unit/server files with 923 tests, and 37 RTL files with 126 tests.
- Targeted ESLint and `git diff --check` passed.

## Review convergence

- Root-cause, regression-test, and server-safety lanes independently agreed the observed state was a P2 UI correctness blocker rather than a stored-attempt or answer-key breach.
- The first exact-head manual review found that lesson-local anchors did not cover the persistent dashboard shell or keyboard lesson search. That finding was accepted and fixed in `d7f9afb` rather than waived.
- Server protections remain fail-closed for sequential passed, max-attempt, and cooldown starts; the pre-existing narrow overlapping start/finalize race remains follow-up scope because it cannot create a completed over-limit attempt.

## Pending release gate

- Exact-head multi-agent rereview, Claude A5 approval, PR checks, Git-connected production deployment, desktop/mobile Chrome history proof, production database row-count evidence, exact fixture cleanup, and final execution-ledger closeout remain required.

## Self-check

- No production data, deployment, alias, environment, or provider configuration was changed by this quick task before its pending release gate.
- No secret value or credential artifact was added to the worktree.
