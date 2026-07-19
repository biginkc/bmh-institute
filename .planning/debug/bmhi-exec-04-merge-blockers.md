---
status: fixing
trigger: "BMHI-EXEC-04: fix the EXEC-03 merge blockers P1.1 through P1.6 and P2 except resolved migration 014 drift"
created: 2026-07-19
updated: 2026-07-19
---

# BMHI-EXEC-04 merge blockers

## Symptoms

- Expected behavior: unreleased imported catalog review stays isolated to explicit reviewers, reviewer evidence can be atomically cleaned before rollback, ordinary admins cannot read or mutate private evidence, and Sandra completion delivery stays suppressed until release.
- Actual behavior: reviewer evidence blocks rollback, answer-option mutation bypasses reviewer RLS, submissions and files are admin-wide, integration coverage can target the wrong database or skip green, and schema lag at `/admin/reports` is not logged clearly.
- Error messages: exact-head E2E fails closed at `/admin/reports` when the TEST project is behind the branch migrations.
- Timeline: found during BMHI-EXEC-03 review at e597928.
- Reproduction: inspect the EXEC-03 ledger and run its integration and exact-head E2E gates against canonical TEST.

## Current Focus

- hypothesis: confirmed and fixed locally. The effective 045 state separates Storage API removal from relational cleanup and keeps every answer-option write inside an authenticated reviewer-bound RPC.
- test: all local contracts are green. Hosted import-release integration covers Storage preflight, revoked-reviewer denial, exact cleanup, Sandra suppression, answer-option creation and radio exclusivity, private submission denial, and ordinary submission preservation.
- expecting: TEST migration 045 applies cleanly and the final hosted integration proves the effective forward repairs.
- next_action: apply forward migration 045 to canonical TEST after 1Password service-account access returns, then run the full hosted integration file with the canonical TEST HTTP keys.
- reasoning_checkpoint: user supplied verified migration rehearsal and resolved 014 drift, so no 014 forward migration is in scope.
- tdd_checkpoint: failing security tests must precede behavioral implementation.

## Evidence

- timestamp: 2026-07-19T00:42:35-05:00
  observed: TDD red run failed because migration 040 did not exist and updateAnswerOption still issued two service-role answer_options updates.
  implication: both P1.1 and P1.2 reproduced before implementation.
- timestamp: 2026-07-19T00:53:03-05:00
  observed: focused migration, submission-boundary, and quiz-action tests passed 15 of 15.
  implication: local contracts now require service-only exact reviewer cleanup, Sandra enqueue and claim suppression, authenticated atomic answer-option writes, and catalog-aware submission policies.
- timestamp: 2026-07-19T00:53:20-05:00
  observed: focused ESLint over all P1.1, P1.2, P1.3 migration, action, and integration files exited 0 with no findings.
  implication: the former integration `const module` lint error is removed and the changed security surface is lint-clean.
- timestamp: 2026-07-19T00:53:03-05:00
  observed: full typecheck reached unrelated in-progress P1.4 test typing errors in src/lib/testing/integration-environment.test.ts after the focused tests passed.
  implication: root must finish the concurrent environment-gate edit before full-suite typecheck is meaningful.

## Eliminated

## Resolution

- root_cause: reviewer grants authorize runtime activity but migrations 019, 031, and 034 treat all resulting activity as immutable rollback blockers. The Sandra trigger and claim run as service role without an unreleased-import guard. updateAnswerOption uses requireAdmin only as an application precheck then performs peer and target writes through a service client that cannot prove the actor or catalog boundary.
- fix: migrations 040 through 045 add exact service-only reviewer evidence cleanup, Storage API preflight, relational-only cleanup, atomic access revocation, Sandra suppression, authenticated atomic answer-option creation and update, and catalog-aware submission and Storage policies. Migration 043 replaces the timed-out row-by-row admin completion report with a set-based implementation. Application pages and actions use the same reviewer boundary and log report RPC failures.
- verification: full local verify passed 147 unit files with 872 tests and 38 RTL files with 109 tests. Lint has no errors. Course-content, artwork-production, and production build passed. TEST is current through 044. Exact-head E2E run 29674299585 attempt 4 passed with 8 tests and 1 intentional skip. Migration 045 and the final hosted integration run remain blocked on unavailable 1Password service-account reads and missing canonical HTTP keys after the prior process was killed.
- files_changed: migrations 040 through 045; security migration contract tests; hosted import release integration; quiz actions and generated database types; submission pages and action tests; integration environment validation; report RPC implementation and logging; Phase-3 runbooks; this debug record.
