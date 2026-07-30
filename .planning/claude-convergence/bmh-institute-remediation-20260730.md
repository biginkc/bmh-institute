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
- Iteration 10: The `ec1b97e` retry proved the shared TEST catalog also lacked the prerequisite `hugo_access_operations` table; applying the hash migration alone was invalid. Updated CI to provision `20260728091000_hugo_access_provisioner.sql` when that table is absent, then apply the hash migration conditionally, pushed as `8443b3d`. The prior run mutated no lifecycle state after the setup failure; fresh exact-head checks are required.
- Iteration 11: Exact-head validation run `30524637094` passed Verify, Hugo/Institute migration setup, canary reconciliation, seeding, and cleanup. Seeded Playwright reached 12 tests: 10 passed, 1 skipped, and 1 failed in the unrelated `pilot-monitoring` report heading (`/admin/reports` did not render `Learner monitoring`). The lifecycle cohort setup path was not among the failed tests; merge remains held pending the authoritative PR checks and manual classification of the unrelated failure.
- Iteration 12: The persistent goal was restored after accidental deletion. Claude CLI preflight is available and authenticated; no secret-free Claude verdict was captured yet, so no Claude convergence claim is made. The current next action is to classify the pilot-monitoring failure against the mainline baseline, then keep implementation lanes concurrent while preserving serial promotion and production Chrome gates.
- Iteration 13: Mainline run `30525691718` reproduced the identical pilot-monitoring failure, proving it is baseline TEST-fixture drift rather than a lifecycle regression. Opened stabilization PR #143 from isolated worktree `pilot-monitoring-baseline-20260730`, head `3240f01`, which grants disposable report owners exact reviewer access to existing unreleased imported programs and removes those grants during cleanup. PR #143 is independent of lifecycle code and is now under its own CI review; lifecycle PR #139 remains unmerged.
- Iteration 14: PR #143 merged at `8566afc`, but its non-required seeded E2E check was red: direct writes to `course_import_reviewers_v1` are intentionally denied, including to `service_role`. Codex confirmed the existing `fn_set_unreleased_import_reviewer_v1` RPC is the authorized setup/cleanup path, implemented that correction in isolated follow-up PR #147 at `6a8a350`, and held all lifecycle promotion. PR #147 checks are in progress; Claude CLI review was attempted but returned no captured output on this head, so no fresh Claude verdict is claimed yet. The original #143 merge is recorded as a gate-process defect, not acceptance evidence.
- Iteration 15: Claude reviewed PR #147 at `b60c0d0` and found partial-grant rollback and cleanup-abort risks. Codex fixed those, then Claude identified orphaned users on rollback failure and silent plain deletes. PR #147 now uses head `68107e2`, queries the catalog before user creation, rolls back grants and created users, verifies every deletion, continues cleanup after individual failures, and reports aggregate cleanup errors. Local diff-check, Prettier, and ESLint pass; fresh CI run `30528065848` is pending/in progress and fresh Claude review is pending capture. No merge, lifecycle promotion, deployment, migration, or production Chrome acceptance has occurred.
- Iteration 16: Claude found and Codex fixed a typecheck mismatch for Supabase thenable delete builders, then found and Codex removed redundant double rollback on reviewer-grant failure. Current PR #147 head is `e47f09f`; local Prettier, ESLint, and diff checks pass. Fresh CI run `30528628771` and fresh Claude review are pending. The lifecycle lane and all serial promotion gates remain held.
- Iteration 17: Hosted Verify runs repeatedly stalled without state updates after starting, including pull-request reruns and manual run `30529498207`; stale runs were canceled and replaced without changing the result. After clean `npm ci`, the exact local gates passed: typecheck, 1,269 unit tests, 167 RTL tests, course-content tests, and artwork-production tests. This is classified as a repeated external GitHub runner stall, not a code failure; no merge or deployment is authorized from local evidence alone.
- Integration order: amended #138 -> Hugo lifecycle -> Institute lifecycle -> PR #137 reconsideration -> learner routing/video -> security -> deletion -> consolidated Chrome acceptance.
- The broader 886-question/course acceptance campaign remains separate and must not be called complete by this tranche.

## Concurrent execution lanes

- Lane 0, integration control: lifecycle PR #139 and its CI/test-environment classification; do not merge while required checks are red. PR #137 is an overlapping open PR and is not an integration dependency; compare against #139, then close or explicitly re-scope it before promotion.
- Lane 1, quiz: retain merged #138 as the code baseline; run focused retry/lock/privacy checks, then isolated production Chrome completion of the existing 51-question attempt.
- Lane 2, lifecycle: after #139 is green and reviewed, rebase as needed, record rollback point, merge, apply the approved migration serially, and run isolated suspend/reactivate/revoke Chrome acceptance.
- Lane 3, routing/video/inventory: rebase `routing-video-20260730` onto the newest main after lifecycle promotion; verify deep links, locked/invalid parts, truthful progress, checkpoint ordering, inventory, and clean isolated video resume.
- Lane 4, editor security: rebase `content-security-20260730` after routing promotion; run editor/server/import/database/renderer validation and unsafe legacy-content checks.
- Lane 5, deletion integrity: rebase `deletion-integrity-20260730` after security promotion; run all six in-app dialogs, typed confirmations, transactional row checks, refusal guards, and race tests.
- Lane 6, acceptance/evidence: maintain the coverage ledger, isolated Chrome profiles, fixture IDs/cleanup receipts, deployment/migration receipts, and requirement-by-requirement evidence packet. This lane is concurrent for preparation but serial for production execution.

## Claude convergence contract

- Every lane iteration sends Claude a secret-free packet containing exact head SHA, diff scope, tests, findings, blockers, acceptance-gate status, and one narrow question.
- Claude returns exactly one verdict: `NEXT_STEP`, `RESEARCH_NEEDED`, `DONE`, `BLOCKED`, or `LOOP_REASSESS`, with proposed action, scope, expected verification, and hard-gate risk.
- Codex adversarially verifies Claude's proposal before acting; valid findings are fixed and the exposing checks rerun.
- Claude `DONE` is only a readiness transition. Codex must still complete manual review, rollback-point recording, serial merge/deploy, and isolated production Chrome proof before closing the goal.

## Constraints

- Dirty root checkouts are read-only boundaries.
- Workers use disjoint worktrees and may not merge, deploy, mutate production, call paid providers, or expose secrets.
- Preserve imported-content protections, frozen role-play event shape/timing/origin, and no-provider-use boundary.
