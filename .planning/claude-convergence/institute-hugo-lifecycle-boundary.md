# Institute Hugo lifecycle boundary convergence ledger

- Goal: Remove Institute account creation, invite revocation, account deletion, and login-status controls from PR #129 while preserving Institute role and role-group course access.
- Plan source: Jarrad's Lane C EXECUTE block delivered by Claude.
- Baseline: PR #129 head `bee9cfe`; current `origin/main` `b27d353`.
- Plan alignment: PR head already contains current main as its merge base. No rebase or main merge is needed.
- Authority: Local code, tests, commit, and push to the existing PR head. Never merge. No migration apply, production write, deploy, or provider call. Live schema inspection is read-only and keeps the Management API credential off stdout.
- Claude transport: This explicit Claude-orchestrated EXECUTE block and the requested REPORT return path.
- Tool preflight: GitHub CLI reached PR #129 and exact-head checks. Browser proof is not an acceptance gate for this source-only boundary correction.

## Acceptance gates

- [x] Runtime source has no `auth.admin.createUser` or `auth.admin.deleteUser` path.
- [x] App behavior cannot change `profiles.status`; Institute settings use only the status-free role-group write.
- [ ] Role editing and role-group assignment both work end to end. Role-group assignment works when the role is unchanged. Role editing is fail-closed because no safe live role-sync operation exists.
- [x] `/admin/role-groups` has no diff.
- [x] `/admin` has no invite query or tile and `/admin/users` has no legacy invite action surface.
- [x] No migration file is created or applied.
- [x] Typecheck, lint, unit, and RTL suites pass.
- [ ] PR #129 exact-head checks pass after push.

## Adversarial notes

- The literal phrase "no path under src reaches auth admin create/delete" includes test-only integration fixtures throughout the repository. Runtime source can satisfy the ownership boundary without deleting unrelated security fixtures. Both searches will be reported.
- Manual review refuted the initial trusted pass-through fallback. A Hugo status change between the read and legacy RPC could be overwritten by Institute.
- Exact-head Seeded Playwright then refuted the direct profile-role update. PostgreSQL rejects that authenticated write, so compensation restored the prior role groups and broke the cohort setup journey.
- Read-only live schema inspection found no status-free role synchronization function and no profile trigger that updates Hugo's grant. The live access gate requires the grant role to equal the profile role even while global grant enforcement is off for existing grant-backed users.
- The service-role `hugo_apply_access` function is not a role-only adapter. It owns grant, status, reactivation, and expiry behavior. Institute cannot call it without crossing this lane's lifecycle boundary.
- The containment save path reads the existing role, rejects a changed role before any mutation, and uses `fn_set_user_role_groups` only when the role is unchanged.
- Role-group pages rely on the guarded admin layout rather than a duplicate page-level guard. This is a defense-in-depth inconsistency but remains out of scope as directed.

## Iterations

- Iteration 1: Current main and PR head inspected before edits. Requested lifecycle removal is absent from both. PR head already includes current main as merge base, so no rebase or merge action is justified.
- Iteration 2: Initial implementation passed the current profile status through `fn_save_user_settings` as allowed by the EXECUTE fallback. Three independent reviewers found the same stale-write race. Focused tests were changed to fail on any status-bearing save path, then the implementation moved to status-free writes.
- Iteration 3: Second review found that writing the role before role groups could leave an admin promotion committed after an entitlement rejection. The order is now role groups then role, with tested compensation to restore prior groups if the role write fails.
- Iteration 4: Final review found the rollback snapshot read error was ignored. The action now fails before either mutation when the prior memberships cannot be read, with a regression test proving zero writes.
- Iteration 5: Full verification passed. Implementation commits `59aba35` and `c303c74` were pushed to the PR head.
- Iteration 6: Exact-head run `30483016237` passed Verify and PostgreSQL validation. Seeded Playwright failed cohort setup because the direct profile-role write was denied and compensation restored the old role groups.
- Iteration 7: Two manual reviewers independently found the deeper grant-role mismatch. Live read-only schema inspection confirmed one grant row, no current mismatch, no hidden synchronizer, and a login gate that requires matching roles for grant-backed users.
- Iteration 8: Commit `9fdd618` removed the unsafe direct write. It preserves role-group assignment when the role is unchanged and fails role changes before mutation. Local typecheck, lint, 1,245 unit tests, and 163 RTL tests pass. Role editing remains an explicit blocker.
