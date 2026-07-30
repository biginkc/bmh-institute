# BMH Institute remediation convergence ledger

- goal_id: `bmh-institute-remediation-20260730`
- goal: Implement and production-verify the eight confirmed Institute defects as a bounded remediation tranche.
- plan_source: user-approved `BMH Institute Remediation — Concurrent Codex Execution With Claude Convergence`.
- baseline: Institute production `012f455df38b8beb7ee8e921eb6ac28c21ad5547`; Hugo baseline `0b1b268975b344f9233f495024686cca108d0d67`; PR #138 `e697acab3cdd643e3faa23884a4649973b086ce0`.
- authority: production-aware; no merge/deploy/provider/database mutation until lane gates and convergence review pass.
- claude_surface: CLI preflight authenticated; desktop/app surface not yet used.
- browser_surface: real Chrome required for final acceptance; browser-control preflight pending.

## Acceptance gates

- [ ] Lesson 1 quiz survives answer lock contention, timeout/reconciliation, refresh, two-tab races, finalization, and next-lesson unlock.
- [ ] Locked quiz deep links, invalid parts, history, and progress loading are truthful.
- [ ] Hugo suspend/reactivate preserves exact Institute role/groups; revoke remains terminal; mixed identity rendering is consistent.
- [ ] Unsafe authored URLs and malformed flashcards are rejected at editor/server/import/database/render boundaries.
- [ ] Six native confirmations are replaced by accessible in-app confirmations; deletion is protected, transactional, and verified.
- [ ] Inventory contract is 919 single-choice, 1 true/false, 0 multi-select; all three platform types have disposable/test coverage.
- [ ] Video pause/reload/navigation/reopen resume works without false completion credit.
- [ ] Every affected journey passes in isolated production Chrome; fixtures are cleaned up with exact IDs.

## Execution state

- Iteration 0: preflight complete; implementation workers dispatched for quiz, lifecycle, routing/video, security, and deletion lanes.
- Iteration 1: first implementation wave completed; independent review rejected release readiness. Valid blockers: late quiz restore overwrite and missing durable lock-timeout proof; checkpoint/observation arrival-order race and client-clock baseline; lifecycle upgrade migration source drift; role-play/storage/legacy-content security gaps; deletion activity and quiz-graph races. Four repair workers dispatched in isolated worktrees.
- Iteration 2: repair waves completed and independently reviewed. Quiz, lifecycle, security, deletion, and routing repository gates pass; hosted TEST SQL credentials and real production Chrome remain outstanding. Claude returned NEXT_STEP: let PR #138 CI finish, then integrate serially; hold/rebase PR #137 because its seeded Playwright role-group assignment flow currently times out after Save Changes.
- Iteration 3: PR #138 merged at `227a6cee` with all CI and seeded E2E checks green. Hugo lifecycle branch rebased onto that main, passed 234 tests plus migration replay/typecheck/lint, and opened as Hugo PR #7. Hugo PR CI is currently pending; Institute lifecycle must wait for that merge before rebasing.
- Integration checkpoint: Hugo PR #7 has all checks green. Rollback point before merge: Hugo `origin/main` `ecf6e7217db394fd963587ca763567c3fd550105`.
- Iteration 4: Hugo PR #7 merged at `b37abba64620347e264b2c0e4ef7256e05ccfc21`. Institute lifecycle rebased onto Institute main `227a6cee`, passed 1,275 unit + 167 RTL tests, typecheck, lint, and migration rehearsals, then opened as Institute PR #139. Its hosted checks are queued.
- Iteration 5: PR #139 hosted seeded E2E completed with 7 passed, 2 failed, 2 flaky, and 1 skipped. Deterministic failures included lifecycle pilot role-group assignment after Save Changes, unrelated assignment submission visibility, and quiz completion visibility; embed sandbox and quiz path were flaky. Failure logs show post-commit notification errors. The failed portions were rerun at `2026-07-30T07:17:59Z`; merge remains held pending rerun evidence and root-cause classification.
- Iteration 6: Root-cause review confirmed the lifecycle E2E failure was a missing migration dependency: CI seeded against TEST without applying PR #139 migrations, so the new role/group RPC was unavailable. Added explicit serialized TEST migration application to `.github/workflows/ci.yml` and pushed PR #139 commit `0fb6ce2`. Fresh CI and PostgreSQL checks are queued; merge remains held.
- Iteration 7: Full `supabase db push --include-all` in CI correctly failed closed on TEST catalog hash drift in the historical oral-check migration. Replaced it with a targeted, serialized `psql` application of only the three PR #139 lifecycle migrations (`20260729210000`, `20260730200000`, `20260730210000`) and pushed `fe4667a`. The failed run applied no lifecycle migration because the first migration transaction refused; fresh checks are required.
- Iteration 8: The PR synchronize event did not create a new CI run for `fe4667a`, so CI was manually dispatched against that exact head as run `30523312858`. Its Verify job is active; this run is validation evidence only until its checks complete and are reconciled with PR #139.
- Iteration 9: Fresh PR checks for `fe4667a` reached the seeded E2E job, but TEST setup failed before browser execution because `20260730200000_hugo_institute_lifecycle_contract.sql` requires `hugo_apply_access_unhashed`, which the shared TEST catalog did not contain. Added an idempotent preflight to apply `20260728113000_hugo_access_operation_payload_hash.sql` only when that prerequisite function is absent, pushed as `ec1b97e`. Merge remains held pending fresh exact-head checks.
- Integration order: amended #138 -> Hugo lifecycle -> Institute lifecycle -> PR #137 reconsideration -> learner routing/video -> security -> deletion -> consolidated Chrome acceptance.
- The broader 886-question/course acceptance campaign remains separate and must not be called complete by this tranche.

## Constraints

- Dirty root checkouts are read-only boundaries.
- Workers use disjoint worktrees and may not merge, deploy, mutate production, call paid providers, or expose secrets.
- Preserve imported-content protections, frozen role-play event shape/timing/origin, and no-provider-use boundary.
