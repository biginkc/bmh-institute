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
- Integration order: amended #138 -> Hugo lifecycle -> Institute lifecycle -> PR #137 reconsideration -> learner routing/video -> security -> deletion -> consolidated Chrome acceptance.
- The broader 886-question/course acceptance campaign remains separate and must not be called complete by this tranche.

## Constraints

- Dirty root checkouts are read-only boundaries.
- Workers use disjoint worktrees and may not merge, deploy, mutate production, call paid providers, or expose secrets.
- Preserve imported-content protections, frozen role-play event shape/timing/origin, and no-provider-use boundary.
