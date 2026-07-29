# Institute role editing convergence ledger

## Loop configuration

- Goal ID: `institute-reenable-role-edit`
- Goal: Restore real `system_role` persistence in the per-user editor after the
  Hugo role-equality dependency was removed.
- Plan source: user-supplied EXECUTE block and
  `.planning/quick/260729-o39-re-enable-institute-system-role-editing-/260729-o39-PLAN.md`.
- Baseline: `origin/main` at `012f455df38b8beb7ee8e921eb6ac28c21ad5547`.
- Branch: `codex/institute-reenable-role-edit`.
- Authority: application-code and test changes plus branch push and PR creation.
  No migration, production mutation, merge, or deployment.
- Claude surface: the current user-supplied Claude EXECUTE block is the
  orchestrator packet. Final review returns through the requested REPORT.
- Evidence record: this file and the eventual PR.

## Tool preflight

- Worktree is clean and starts at the exact `origin/main` merge of PR #136.
- GitHub CLI is available and authenticated.
- Claude CLI is available and authenticated, but no outbound Claude call is
  needed because Claude supplied the execution plan and owns the next review.
- Vercel CLI is available but irrelevant because deployment is out of scope.
- The repository-local `node_modules/next/dist/docs` guide directory is absent.
  This change restores an existing server-action pattern and introduces no new
  Next.js API.
- GSD quick initialization succeeded as task `260729-o39`.
- Browser proof is not an acceptance gate for this isolated server-action
  regression and no preview or production release is authorized.

## Acceptance gates

- [ ] Per-user save persists a role change with unchanged or changed role groups.
- [x] Per-user self-demotion remains blocked before any mutation.
- [x] Users-list `updateUserRole` remains independently green and consistent.
- [x] Typecheck, lint, unit, and RTL suites pass.
- [x] No migration file changes.
- [ ] Manual review is clean.
- [x] Branch is pushed and an unmerged PR is open.

## Iterations

### Iteration 0

- Adversarial finding: deleting only `confirmSystemRoleIsUnchanged` would return
  success without changing the role because commit `9fdd618` also removed the
  profile update and compensation path.
- Local prerequisite evidence: baseline contains merged PR #136 and commit
  `f794a5d`, whose migration removes grant-role/profile-role equality from
  `fn_hugo_grant_row_is_active`.
- Decision: restore the full pre-guard role persistence and rollback behavior.
- Next action: write the regression test first and capture the expected failure.

### Iteration 1

- Red evidence: focused baseline run failed 10 of 16 tests. The role-change
  assertion returned the temporary guard error or `User not found`.
- Green evidence: the first implementation passed 17 focused tests, typecheck,
  lint, 1,248 unit tests, and 163 RTL tests.
- Pull request: #137 opened at head `5a6f2c1`.
- Manual review rejected that head. Migration 025 proves the cookie-backed
  client cannot update `profiles.system_role`, so both role actions were still
  broken against the real database.

### Iteration 2

- Accepted review fixes:
  - use `createAdminClient()` only for exact role writes after `requireAdmin()`
  - keep `fn_set_user_role_groups` on the signed-in client
  - block every real self-role change while allowing unchanged self roles
  - require a returned row from standalone role updates
- Verification after fixes: 21 focused tests, typecheck, lint with 0 errors,
  1,252 unit tests, 163 RTL tests, both Husky verify runs, diff checks, and
  Fallow passed.
- Rejected as outside the no-migration fix scope:
  - transaction-safe combined role and role-group persistence
  - Hugo lifecycle changes that preserve Institute-owned roles
- Blocker: `hugo_apply_access_unhashed` can later write Hugo input or grant role
  back to `profiles.system_role`. Owner usability still requires a matching
  owner grant role. The stated preconditions prove immediate access only.
- Browser review: valuable, but not run because no safe disposable production
  role-write fixture was authorized for this code-only task.
- Current verdict: blocked. The application head improves immediate behavior,
  but durable role ownership is not proven and cannot be corrected without
  database work.
