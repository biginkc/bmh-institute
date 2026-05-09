---
status: complete
quick_id: 260509-3ao
slug: set-performance-thresholds-for-report-an
date: 2026-05-09
issue: 9
---

# Summary

Added `docs/performance-thresholds.md` as the active trigger policy for parked performance work.

## Completed

- Defined measurement rules for promoting PERF work.
- Set route-level thresholds for admin reports, user reports, course reports, lesson signed URLs, authoring lists, and production readiness runtime.
- Added volume review triggers for learners, courses, content blocks, submissions, activity rows, and storage-backed lesson content.
- Mapped PERF-01, PERF-02, and PERF-03 to the exact trigger that should start each item.
- Tightened the invite acceptance E2E cleanup after CI exposed stale localhost set-password rate-limit rows from previous runs.

## Verification

- Structural check passed: `docs/performance-thresholds.md` exists and includes `PERF-01`, `PERF-02`, `PERF-03`, and `GitHub issue #9`.
- `git diff --check` passed.
- `npm run verify` passed: typecheck, 44 unit test files with 192 tests, and 3 RTL files with 9 tests.
- Focused local Playwright could not run in this worktree because local `TEST_SUPABASE_*` values were not populated. CI has the needed secrets and remains the E2E gate.
- Reran `npm run verify` after the CI rate-limit cleanup fix. It passed with the same typecheck, unit, and RTL counts.
