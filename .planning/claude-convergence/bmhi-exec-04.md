# BMHI-EXEC-04 convergence ledger

- Goal: fix all remaining BMHI-EXEC-03 merge blockers without committing, pushing, merging, or writing production.
- Plan source: Jarrad's BMHI-EXEC-04 work order plus the EXEC-03 ledger at baseline e597928.
- Baseline: e597928636485833483403d18aafa2db4148fafa.
- Authority: local workspace writes and hosted writes to TEST project jvaabkchkihkjllehmft only after P1.4 is fixed. Production is read-only.
- Exclusions: migration 014 drift is resolved. P1.5 is deployment ordering owned by Claude. No `.git` writes.

## Acceptance gates

- [x] Atomic service-role cleanup removes reviewer-only evidence for the sole unreleased import and permits rollback while non-reviewer learner evidence still blocks it.
- [x] Sandra completion outbox enqueue and delivery attempts are suppressed for unreleased imported programs.
- [x] Answer option mutation requires authenticated reviewer access to the target unreleased imported catalog.
- [x] Private imported submissions pages, actions, and storage objects are reviewer-only while ordinary admin access to normal catalog submissions remains unchanged.
- [x] Integration bootstrap validates every required URL and key as canonical TEST, forwards the validated DB URL, and fails required coverage instead of skipping.
- [x] `/admin/reports` logs the underlying fail-closed RPC error.
- [ ] Migration dry-run and push through 045 succeed against canonical TEST. TEST is current through 044. Forward repair 045 is locally green but pending because the 1Password service account stopped responding.
- [ ] Hosted integration file passes against the final TEST schema. The prior 040 through 043 run passed 9 of 9. The final 045 run is pending because the killed process lost the HTTP keys and the CLI token receives 403 for key retrieval.
- [ ] Full local verify and lint pass. Exact-head E2E attempt 4 passed after 044, but must rerun once pending 045 is on TEST.
- [x] Phase-3 runbook documents reviewer mode, grants, allowed actions, Storage API cleanup, atomic access revocation, and rollback behavior.
- [x] Commit plan exists at Claude's requested scratchpad path with migration rehearsal harness isolated.

## Preflight

- Claude surface: current work order is already supplied by Claude through Jarrad. No independent outbound Claude call is required before implementation.
- Checkout: branch codex/institute-complete-course-v1 at e597928.
- Existing untracked artifacts preserved: EXEC-03 ledger, EXEC-03 GSD packet, migration rehearsal harness.
- Vault drift scanner: stale and failing since June. It is not accepted as current evidence.
- Provider CLI and TEST credentials: to be verified without printing secret values after the P1.4 guard is implemented.

## Iteration 1

- Status: investigation and TDD surface mapping in progress.
- Claude verdict source: BMHI-EXEC-04 work order requires remediation of the enumerated findings.
- Codex adversarial evaluation: scope is plan-aligned and testable. Hosted writes are restricted to canonical TEST and must occur only after the new environment gate passes.

## Final execution evidence

- Local verify: 147 unit files with 872 tests passed. 38 RTL files with 109 tests passed.
- Lint: exit 0 with 9 pre-existing warnings and no errors.
- Course-content tests, artwork-production tests, and Next production build passed. Build generated 12 of 12 static pages.
- TEST database URL validation passed. Migration 044 parsed inside a hosted rollback transaction. The dry run listed only 044. Push succeeded. Follow-up dry run reported the remote database current with history `44:001:044`.
- Exact-head workflow run 29674299585 attempt 4 at e597928 passed after migration 044. Playwright reported 8 passed and 1 intentional skip. Fixture cleanup returned `{ "ok": true, "cleaned": true }`.
- Final adversarial review found two effective-chain Storage regressions in 044. Migration 045 replaces the transitive v040 SQL Storage delete, moves linked versus unlinked owner reads into a security-definer helper, and drops owner self-delete. Both DB and app reviewers re-reviewed effective 040 through 045 as clean.
- Remaining external blocker: the 1Password service account worked for migration 044, then stopped returning from `op read` and `op whoami`. The killed process also lost the TEST HTTP keys. The current Supabase CLI token receives HTTP 403 from the TEST API-key endpoint. The strict gate correctly prevents substituting noncanonical credentials.
