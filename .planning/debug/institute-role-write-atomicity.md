---
status: resolved
trigger: "Independent review rejected PR #137 because UUID string casing bypasses self-role protection, role and role-group writes are not atomic, and service-role writes do not re-authorize the actor at write time."
created: 2026-07-29
updated: 2026-07-29
---

# Institute role write atomicity

## Symptoms

- Expected behavior: A single database operation compares UUID values, re-checks the actor's current admin status, preserves self-role restrictions, and updates role plus role groups atomically.
- Actual behavior: JavaScript compares client-submitted UUID text, the application performs separate database writes with a compensating rollback, and the service-role write trusts an earlier authorization check.
- Error messages: Independent review returned REJECT with two P1 findings and one P2 finding.
- Timeline: Introduced by the role-write restoration on PR #137.
- Reproduction: Submit the authenticated actor's UUID with different letter casing. The JavaScript self-check misses while PostgreSQL still targets the actor's UUID row.

## Current Focus

- hypothesis: Confirmed. The write path must move behind one typed SECURITY DEFINER RPC because JavaScript normalization cannot make separate requests atomic or re-authorize at the database write boundary.
- test: Add one real PostgreSQL behavioral test for normalized UUID self-identity, transaction rollback after a deliberately failing second mutation, and rejection after the actor has been de-admined. Add action tests proving both actions use only the service-role RPC and correctly map its receipts.
- expecting: The current implementation fails because it performs a strict text self-check, uses two clients and up to three requests, and has no database receipt or write-time actor check.
- next_action: Push the verified atomic role-write repair to PR #137 for Claude review.
- reasoning_checkpoint: PR #137 head is exactly 71b5a02a4b5cd7b3b3e6c43c321f68cfc37db5f3 on codex/institute-reenable-role-edit. The local branch matched origin at investigation start.
- tdd_checkpoint: Write the action contract tests and PostgreSQL behavioral test before changing either action or adding the migration. The SQL test must exercise the function, not merely inspect migration text.

## Evidence

- timestamp: 2026-07-29 18:02 CDT
  checked: PR identity
  found: `gh pr view 137` reports OPEN, head branch `codex/institute-reenable-role-edit`, head SHA `71b5a02a4b5cd7b3b3e6c43c321f68cfc37db5f3`, base `main`. Local HEAD and `origin/codex/institute-reenable-role-edit` were the same SHA at investigation start.
  implication: All conclusions below apply to the exact current PR head requested by the reviewer.

- timestamp: 2026-07-29 18:02 CDT
  checked: Both application role-write paths
  found: `src/app/(dashboard)/admin/users/actions.ts:14-27` compares `me.id === input.userId`, then writes `profiles.system_role` through `createAdminClient()`. `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:32-38` repeats the same text comparison. Its `persistInstituteSettings` at lines 123-163 calls `fn_set_user_role_groups`, performs a separate service-role profile update, then conditionally calls `fn_set_user_role_groups` again as compensation.
  implication: The case bypass, authorization time-of-check/time-of-use gap, lost-response ambiguity, process-death window, rollback failure, and stale-snapshot overwrite are all present. No application-level UUID normalization can repair the transaction or write-time authorization findings.

- timestamp: 2026-07-29 18:02 CDT
  checked: Existing role-group and combined-setting functions
  found: `supabase/migrations/012_data_integrity.sql:3-27` defines `fn_set_user_role_groups(uuid, uuid[])`. It authorizes with `is_admin(auth.uid())`, then atomically deletes and inserts memberships. Lines 29-59 define the older `fn_save_user_settings`, but it also changes login `status`, authorizes through `auth.uid()`, and is client-executable by `authenticated` at lines 194-199.
  implication: Neither existing function is a safe replacement. The service-role action cannot reuse `fn_set_user_role_groups` because its service JWT has no end-user `auth.uid()`. `fn_save_user_settings` crosses the frozen Hugo login-status boundary and must remain unused. The new function must inline the existing distinct UUID membership rewrite.

- timestamp: 2026-07-29 18:02 CDT
  checked: Write-time service-role and owner-protection precedent
  found: `supabase/migrations/20260728091000_hugo_access_provisioner.sql:116-130` defines `fn_hugo_require_service_role()`. `supabase/migrations/20260728230000_hugo_access_authorization_hardening.sql:164-199` defines the exact current usable-owner predicate and lines 603-676 install the authoritative profile trigger for final usable owner protection. That trigger acquires advisory lock key `hugo-institute-privileged-lifecycle-v1`.
  implication: The new function should call the existing service-role guard, acquire the same advisory transaction lock before row locks, re-read and lock the actor and target, and rely on the existing trigger for the final usable owner invariant. Reimplementing a simple owner count would weaken the current Hugo-aware protection.

- timestamp: 2026-07-29 18:02 CDT
  checked: Institute app-owned role access
  found: `supabase/migrations/20260729205000_institute_app_owned_role_access.sql:9-39` intentionally makes active Hugo access independent of the grant row's role after provisioning. `src/lib/auth/guard.ts:15-42` still requires an active profile and an owner/admin role at request time.
  implication: The RPC must preserve Institute-owned roles and must not update Hugo grant data or profile status. For parity with `requireAdmin()`, the write-time recheck should require `profiles.status = 'active'`, `system_role in ('owner','admin')`, and current Hugo access through `fn_hugo_access_is_active(p_actor_id)`.

- timestamp: 2026-07-29 18:02 CDT
  checked: Closer precedent
  found: Closer's `supabase/migrations/20260729130000_closer_app_owned_roles.sql:261-361` uses UUID actor and target parameters, `SECURITY DEFINER`, a pinned search path, the service-role guard, the shared lifecycle advisory lock, actor and target `FOR UPDATE` reads, JSON receipts, final-owner protection, revoke from `public/anon/authenticated/service_role`, then grant only to `service_role`.
  implication: Institute should copy the security shape, not Closer-specific policy. Closer's owner-only peer-role rule and bootstrap-owner rule do not exist in Institute's current role semantics and should not be imported.

- timestamp: 2026-07-29 18:02 CDT
  checked: Existing tests that must change or remain
  found: At PR head, `src/app/(dashboard)/admin/users/actions.test.ts:68-145` asserts a direct admin-client update for `updateUserRole` and separately protects `setUserRoleGroups`. `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts:174-319` asserts the unsafe compensating rollback. Lines 365-414 cover self-role rules and same-role self group assignment. `src/lib/security/hugo-provisioning-boundary.test.ts:34-42` requires the direct profile update and old role-group RPC. `src/app/(dashboard)/admin/users/[userId]/edit/save-settings.test.ts:120-137` protects release-control error normalization.
  implication: Replace direct-update and rollback expectations with one `fn_update_institute_role` service RPC expectation. Keep the standalone `setUserRoleGroups` test unchanged. Keep email diffing and error normalization coverage. Update the Hugo boundary source test to forbid direct profile role writes and require the new RPC.

- timestamp: 2026-07-29 18:02 CDT
  checked: Database behavior harness
  found: `scripts/test-hugo-access-postgres.mjs:41-123` creates disposable PostgreSQL 15, 16, and 17 clusters, applies every migration in filename order, and runs numbered SQL behavioral tests. `scripts/fixture-boundary/run-controller-gate-pr-harness.mjs:258-338` is the PR workflow's multi-version migration acceptance path but currently lists tests only through Hugo test 062. `.github/workflows/db-migrate-test.yml:40-87` runs that controller harness for migration PRs. No `.env.test.local` exists in this worktree, while `vitest.integration.config.ts:43-66` intentionally refuses to run without all canonical TEST credentials.
  implication: Add the new numbered SQL test to both local PostgreSQL test lists so the PR checks execute it on PostgreSQL 15, 16, and 17. Do not substitute a mocked Vitest test for atomicity. The local disposable Postgres harness is available even though hosted TEST integration credentials are absent.

- timestamp: 2026-07-29 18:02 CDT
  checked: Generated RPC typing and standalone action semantics
  found: `src/lib/supabase/types.ts:1773-1806` contains generated definitions for `fn_save_user_settings` and `fn_set_user_role_groups` but no new RPC. `updateUserRole` has no role-group input, while `saveUserSettings` must distinguish clearing all groups from preserving groups.
  implication: Add the new RPC to generated types. Use `p_role_group_ids uuid[]` with `NULL` meaning preserve existing memberships and an empty array meaning clear all memberships. `saveUserSettings` passes its array. Standalone `updateUserRole` passes `NULL`, avoiding a racy application snapshot.

- timestamp: 2026-07-29 18:25 CDT
  checked: Implemented repair and focused application coverage
  found: Focused Vitest passed 4 files and 22 tests. Both actions call only `fn_update_institute_role` for role writes. The per-user action passes role groups in the same RPC and the standalone action passes `NULL`.
  implication: The application no longer performs a direct profile role write or compensating role-group rollback.

- timestamp: 2026-07-29 18:25 CDT
  checked: Real PostgreSQL behavior
  found: `npm run test:hugo-access:postgres` passed all 87 migrations and 11 focused SQL tests on PostgreSQL 17. Test 065 proved case-insensitive UUID self-identity, paired-write rollback, write-time actor revocation, successful paired writes, `NULL` membership preservation, final-owner protection, and private function ACLs. PostgreSQL 15 and 16 binaries were unavailable locally.
  implication: The database itself proves the three security and atomicity gates on the locally available major version.

- timestamp: 2026-07-29 18:26 CDT
  checked: Full repository verification
  found: `npm test` passed 205 files and 1,253 tests. `npm run typecheck` passed. `npm run lint` passed with 0 errors and 13 inherited warnings. `npm run test:rtl` passed 41 files and 163 tests. The controller database gate also passed.
  implication: No existing automated suite regressed and the PR database path executes the new SQL proof.

- timestamp: 2026-07-29 18:27 CDT
  checked: Changed-file quality audit and residual scope
  found: Fallow returned `pass` with zero introduced dead-code, complexity, or duplication findings. The new migration creates only the scoped function and its ACL. A separate pre-existing Hugo lifecycle path can still write Hugo role input back to `profiles.system_role`.
  implication: The requested atomic role-edit repair is verified. The broader Hugo lifecycle overwrite remains a disclosed limitation and is intentionally not folded into this migration.

## Eliminated

- hypothesis: Normalize or case-fold `input.userId` in JavaScript.
  reason: This could repair only one spelling variant. It cannot make separate writes atomic, re-authorize at write time, or bind identity to PostgreSQL's UUID semantics.

- hypothesis: Reuse `fn_set_user_role_groups` from the service-role action.
  reason: The function checks `is_admin(auth.uid())`. A service-role RPC does not carry the authenticated end user's UUID in `auth.uid()`, and passing a session client would make role writes depend on client-facing execute access.

- hypothesis: Reuse `fn_save_user_settings`.
  reason: It mutates profile status, is granted to authenticated clients, and violates the current Hugo-only login lifecycle boundary.

- hypothesis: Prove atomicity with action mocks alone.
  reason: A mock can assert one RPC call but cannot prove PostgreSQL statement rollback, trigger behavior, UUID normalization, grants, or write-time locking.

- hypothesis: Copy every Closer role policy.
  reason: Closer's owner-only elevated-role policy and bootstrap-owner immutability are product-specific. Institute's accepted behavior currently allows active admins and owners to manage another user's Institute role, subject to self-change and final usable owner guards.

## Resolution

- root_cause: PR #137 moved role writes to the service client but left authorization and identity comparison in JavaScript and split the intended logical save across independent database requests. PostgreSQL therefore receives a normalized UUID after the JavaScript text guard, while service-role writes no longer have any current actor check. Compensation cannot emulate a transaction and can overwrite a concurrent edit.
- fix: Add exactly one scoped `SECURITY DEFINER` function plus ACL statements. Recommended contract is `fn_update_institute_role(p_actor_id uuid, p_target_id uuid, p_role text, p_role_group_ids uuid[]) returns jsonb`, with `NULL` role groups meaning preserve and an empty array meaning clear. Pin `search_path = ''`, call `public.fn_hugo_require_service_role()`, acquire `hugo-institute-privileged-lifecycle-v1`, lock and re-read actor and target, require active current Hugo access and owner/admin actor role, compare actor and target as UUIDs, reject only a changed self role, validate the requested role, update the profile first, then rewrite distinct memberships when the array is non-NULL, and return structured `ok/code/status/user_id/role` receipts. Let SQL exceptions from profile and membership triggers abort the whole statement. Revoke from `public`, `anon`, `authenticated`, and `service_role`, then grant execute only to `service_role`.
- verification: Passed focused Vitest (4 files, 22 tests), `npm test` (205 files, 1,253 tests), `npm run typecheck`, `npm run lint` (0 errors, 13 inherited warnings), `npm run test:rtl` (41 files, 163 tests), `npm run test:hugo-access:postgres` (87 migrations and 11 SQL tests on PostgreSQL 17), the controller database gate, `git diff --check`, and Fallow changed-file audit. PostgreSQL 15 and 16 were unavailable locally.
- files_changed: Added the scoped migration and SQL behavior test, wired both role actions to the new RPC, updated generated RPC types and action contracts, and added test 065 to both database harness paths.
