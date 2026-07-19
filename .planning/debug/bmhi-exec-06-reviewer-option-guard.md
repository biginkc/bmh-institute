---
status: resolved
trigger: "BMHI-EXEC-06: resolve the reviewer answer-option 42501 collision while preserving out-of-band imported descendant guards and rollback cleanup"
created: 2026-07-19
updated: 2026-07-19
---

# BMHI-EXEC-06 reviewer option guard

## Symptoms

- Expected behavior: a current authorized reviewer can create and update quiz answer options inside the exact unreleased imported program. All other out-of-band descendant inserts remain blocked. Reviewer-created options are removed by the same exact reviewer cleanup so rollback cannot be stranded.
- Actual behavior: the authenticated reviewer create RPC reaches the imported-descendant insert guard and raises SQLSTATE 42501 with `Imported catalog descendants may only be created by the exact apply or release operation.`
- Error messages: hosted `import-release-control.integration.test.ts` fails deterministically at the reviewer answer-option create assertion.
- Timeline: first observed after migration 045 was applied to canonical TEST during BMHI-EXEC-05.
- Reproduction: run the full hosted import release integration file against canonical TEST with writes authorized.

## Current Focus

- hypothesis: confirmed. Migration 033's `fn_guard_imported_catalog_insert()` rejects the authenticated create RPC because its imported descendant branch only accepts the exact service-role apply marker. Migration 044 authenticates the reviewer and catalog but does not bind that authorization into the answer-option trigger transaction.
- test: migration contract coverage plus hosted create, update, revocation, cleanup, rollback, manual draft, and rogue insert coverage.
- result: migration 046 binds the exception to the exact authenticated reviewer RPC and exact unreleased imported question. It records reviewer-created rows for exact cleanup before reviewer grant revocation.
- reasoning_checkpoint: canonical TEST migration 046 is applied. The complete hosted file passed with nine tests executed and zero skips.
- tdd_checkpoint: the focused contract test failed before migration 046 existed and passed after implementation.

## Evidence

- Initial focused red: the migration contract test failed because `046_reviewer_answer_option_reconciliation.sql` did not exist.
- Focused migration contracts: four files and 25 tests passed.
- Full local verification: typecheck passed. Unit suite passed 148 files and 878 tests. RTL suite passed 38 files and 109 tests.
- Additional local gates: lint passed with zero errors and nine pre-existing warnings. Build passed. Course content passed 162 checks with zero skips. Artwork production passed 46 checks with zero skips.
- Canonical TEST: migration history through 046 was verified and a repeat dry run reported the remote database up to date.
- Hosted integration: `import-release-control.integration.test.ts` passed one file and all nine tests in 25.02 seconds. No tests were skipped.

## Eliminated

- Migration 029 and migration 034 do not raise the observed answer-option create error.
- The authenticated reviewer create RPC is not itself the raiser. It reaches the migration 033 trigger as `authenticated` even though the RPC is `security definer`.
- A blanket authenticated insert exemption is unnecessary and unsafe. Direct authenticated table inserts remain denied by table privileges. Direct service-role imported answer-option inserts remain denied by the exact-operation trigger.

## Resolution

- root_cause: migration 033 installs `fn_guard_imported_catalog_insert()` on `answer_options`. For imported descendants it permits only `service_role` with the exact `bmh.apply_import_id`. Migration 044's authenticated reviewer create RPC inserts without that marker. PostgreSQL therefore raises SQLSTATE 42501 with `Imported catalog descendants may only be created by the exact apply or release operation.`
- fix: migration 046 replaces only the answer-option insert and delete triggers. The insert exception requires the authenticated current reviewer, exact user, generated option, question, lesson, program, import, unpublished catalog, and no release record. A private sidecar records each reviewer-created option. The effective migration 040 cleanup removes only those exact rows before the public cleanup revokes reviewer access. The update RPC now serializes with apply, release, cleanup, and rollback. Every other descendant insert keeps migration 033's guard.
- verification: all local focused and full gates passed. Migration 046 was transaction rehearsed and pushed to canonical TEST. The full hosted release-control integration file executed all nine tests with zero skips and all passed.
- files_changed: `supabase/migrations/046_reviewer_answer_option_reconciliation.sql`, `src/lib/security/reviewer-option-reconciliation-migration.test.ts`, `src/lib/security/import-release-control.integration.test.ts`, and this debug record.
