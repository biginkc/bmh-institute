---
status: resolved
trigger: "PR #137 Seeded Playwright E2E regressed because fn_update_institute_role requires the actor to have active Hugo access in addition to being an active Institute-native owner or admin."
created: 2026-07-29
updated: 2026-07-29
---

# Institute role actor Hugo coupling

## Symptoms

- Expected behavior: An active Institute-native owner or admin can update another user's Institute role through the atomic RPC without needing a separate Hugo grant row.
- Actual behavior: The pilot cohort Playwright correction flow is rejected as NOT_ADMIN when its valid Institute admin fixture has no Hugo grant row.
- Error messages: `e2e/pilot-cohort-setup.spec.ts:25` fails in CI at `reviews and corrects missing pilot access`.
- Timeline: The spec passed on main and regressed after PR #137 added the atomic role update migration.
- Reproduction: Run the seeded pilot cohort Playwright spec against PR #137's migration state.

## Current Focus

- hypothesis: The actor authorization check over-couples Institute-native role editing to Hugo access through `fn_hugo_access_is_active(p_actor_id)`.
- test: Remove the SQL fixture's Hugo grant for its active Institute-native admin actor. The current migration must then fail with NOT_ADMIN before the clause is removed.
- expecting: Removing only the Hugo actor-access clause restores the E2E flow while the row-locked active owner/admin check, UUID self-role guard, and atomic write SQL tests remain green.
- next_action: Push the verified commit to PR #137 and let CI provide the PostgreSQL 15/16 and seeded Playwright confirmation.
- reasoning_checkpoint: PR #137 CI already established the Playwright regression. Local Playwright is prohibited because E2E_SEED_PASSWORD is absent, so the disposable PostgreSQL harness is the local behavioral proof.
- tdd_checkpoint: SQL fixture changed first to model an active Institute-native admin with no Hugo grant.

## Evidence

- timestamp: 2026-07-29
  checked: SQL regression fixture without production-like grant enforcement
  found: Omitting the actor grant alone stayed green because the local migration default has `hugo_access_settings.enforce_grants = false`.
  implication: The fixture must enable grant enforcement to exercise the same `fn_hugo_access_is_active` result as PR #137 CI.

- timestamp: 2026-07-29
  checked: SQL regression fixture with grant enforcement enabled
  found: `npm run test:hugo-access:postgres` failed test 065 at the case-varied UUID assertion before the migration change. The actor was an active admin with no grant and `fn_hugo_access_is_active(actor)` was false.
  implication: The Hugo predicate returned NOT_ADMIN before the existing UUID self-role guard, reproducing the confirmed authorization regression locally.

- timestamp: 2026-07-29
  checked: Focused PostgreSQL verification after the migration edit
  found: `npm run test:hugo-access:postgres` passed all 87 migrations and 11 SQL tests on PostgreSQL 17. PostgreSQL 15 and 16 are unavailable locally.
  implication: The no-grant Institute admin regression is green while the existing UUID self-change, atomic rollback, stale-admin, paired-write, and final-owner cases remain green on the locally available database major.

- timestamp: 2026-07-29
  checked: Full local repository gates
  found: `npm test` passed 205 files and 1,253 tests. `npm run typecheck` passed. `npm run lint` passed with 0 errors and 13 inherited warnings. `npm run test:rtl` passed 41 files and 163 tests.
  implication: The focused database authorization repair did not regress the locally runnable application suites.

- timestamp: 2026-07-29
  checked: Scoped manual review
  found: Independent SQL authorization and regression-test lanes returned no findings. Fallow found no introduced issues in the PR changed files.
  implication: The minimum clause removal and its behavioral regression fixture are ready to push for CI confirmation.

## Eliminated

## Resolution

- root_cause: The atomic RPC coupled Institute-native admin authorization to active Hugo access. With grant enforcement enabled, a valid active Institute admin without a Hugo grant received NOT_ADMIN before the UUID self-change or atomic update logic.
- fix: Remove only the `fn_hugo_access_is_active(p_actor_id)` predicate from the locked actor authorization branch. Keep the fresh locked profile role/status read, active owner/admin gate, UUID self-role check, and atomic role plus role-group transaction.
- verification: Red PostgreSQL test reproduced the NOT_ADMIN ordering. Green PostgreSQL 17 harness passed 87 migrations and 11 SQL tests. Unit, typecheck, lint, and RTL gates passed. CI must provide PostgreSQL 15/16 and seeded Playwright confirmation.
- files_changed: `supabase/migrations/20260729210000_atomic_institute_role_update.sql`, `supabase/tests/065_atomic_institute_role_update.sql`
