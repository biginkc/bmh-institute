# Institute Hugo lifecycle boundary convergence ledger

- Goal: Remove Institute account creation, invite revocation, account deletion, and login-status controls from PR #129 while preserving Institute role and role-group course access.
- Plan source: Jarrad's Lane C EXECUTE block delivered by Claude.
- Baseline: PR #129 head `bee9cfe`; current `origin/main` `b27d353`.
- Plan alignment: PR head already contains current main as its merge base. No rebase or main merge is needed.
- Authority: Local code, tests, commit, and push to the existing PR head. Never merge. No migration apply, production write, deploy, provider call, or secret read.
- Claude transport: This explicit Claude-orchestrated EXECUTE block and the requested REPORT return path.
- Tool preflight: GitHub CLI reached PR #129 and exact-head checks. Browser proof is not an acceptance gate for this source-only boundary correction.

## Acceptance gates

- [x] Runtime source has no `auth.admin.createUser` or `auth.admin.deleteUser` path.
- [x] App behavior cannot change `profiles.status`; Institute settings use only status-free role and role-group writes.
- [x] Role editing and role-group assignment retain focused test coverage.
- [x] `/admin/role-groups` has no diff.
- [x] `/admin` has no invite query or tile and `/admin/users` has no legacy invite action surface.
- [x] No migration file is created or applied.
- [x] Typecheck, lint, unit, and RTL suites pass.
- [ ] PR #129 exact-head checks pass after push.

## Adversarial notes

- The literal phrase "no path under src reaches auth admin create/delete" includes test-only integration fixtures throughout the repository. Runtime source can satisfy the ownership boundary without deleting unrelated security fixtures. Both searches will be reported.
- Manual review refuted the initial trusted pass-through fallback. A Hugo status change between the read and legacy RPC could be overwritten by Institute. The save path now uses the existing status-free `fn_set_user_role_groups` function before a direct `system_role` update. If the role update fails, it makes a compensating call to restore the prior groups. This avoids every status write without a migration and prevents a rejected entitlement save from leaving an admin promotion applied. Supabase REST cannot make the two writes strictly atomic. A second failure during compensation is surfaced explicitly.
- Role-group pages rely on the guarded admin layout rather than a duplicate page-level guard. This is a defense-in-depth inconsistency but remains out of scope as directed.

## Iterations

- Iteration 1: Current main and PR head inspected before edits. Requested lifecycle removal is absent from both. PR head already includes current main as merge base, so no rebase or merge action is justified.
- Iteration 2: Initial implementation passed the current profile status through `fn_save_user_settings` as allowed by the EXECUTE fallback. Three independent reviewers found the same stale-write race. Focused tests were changed to fail on any status-bearing save path, then the implementation moved to status-free writes.
- Iteration 3: Second review found that writing the role before role groups could leave an admin promotion committed after an entitlement rejection. The order is now role groups then role, with tested compensation to restore prior groups if the role write fails.
- Iteration 4: Final review found the rollback snapshot read error was ignored. The action now fails before either mutation when the prior memberships cannot be read, with a regression test proving zero writes.
- Iteration 5: Full verification passed and Fallow reported no introduced findings. Implementation commit `59aba35` is ready for push. Exact-head GitHub checks remain pending.
