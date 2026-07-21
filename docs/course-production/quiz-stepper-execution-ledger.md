# Quiz one-by-one convergence execution ledger

## Goal

Replace the learner quiz page with a one-question-at-a-time flow that gives
server-verified feedback after each locked answer, resumes an incomplete
attempt after refresh, and never discloses an unanswered question's answer key.

## Baseline and authority

- Goal ID: `quiz-one-by-one`.
- Plan source: `docs/course-production/quiz-stepper-plan.md` at `1687f5b`.
- Branch: `claude/quiz-one-by-one`.
- Baseline: `1687f5b4270d741df6ea7ee583243e7d49de15e4`, forked from
  `origin/main` at `31aeb4b260a20f2252e3b118909449533227a7e9`.
- Authority: production-aware but scoped to the test Supabase project
  `jvaabkchkihkjllehmft` for the new migration and functional verification.
- Excluded: production database changes, push, PR creation, merge, and deploy.
  The loop stops after execution-order step 5 (local commit).

## Plan alignment

- The requested work is directly anchored to the approved repo plan and has no
  implementation divergence.
- The plan's acceptance checklist contains seven checkbox entries even though
  the handoff describes eight. This ledger tracks those seven verbatim and adds
  the explicit execution-order requirement that the completed work be locally
  committed as the eighth independently verifiable gate.
- Locked no-diff files: `src/lib/quizzes/score.ts`,
  `src/lib/quizzes/attempts.ts`, and
  `src/lib/quizzes/attempt-selection.ts`.

## Tool and transport preflight — 2026-07-21

- Claude surface: this conversation, explicitly selected by the handoff and
  reachable for checkpoint packets. The initial packet is the approved plan and
  execution instruction received in this task.
- Claude CLI fallback: unavailable (`claude` is not on `PATH`); it is not needed
  while the selected conversation surface remains available.
- Supabase CLI: available, version `2.109.1`.
- GitHub CLI: available and authenticated. It will be used read-only if needed;
  push and PR operations are outside scope.
- Node/npm: available and dependencies are installed.
- Google Chrome: installed and running. Chrome/DevTools remains the required
  browser acceptance surface.
- Vault drift: `_meta/contradiction.log` shows the scanner failing hourly through
  2026-07-21. Live worktree, browser, and test-project evidence therefore take
  precedence for this lane.
- Worktree: clean at preflight, with only the committed plan differing from
  `origin/main`.

## Acceptance gates

- [x] Migration applies cleanly to the test project; the exact
  `fn_record_quiz_answer(uuid, uuid, text[])` signature exists.
- [x] `score.ts`, `attempts.ts`, and `attempt-selection.ts` have zero diff
  against `origin/main`.
- [x] `npm run verify` passes with zero failures and zero new skips.
- [x] Every new or updated test required by the plan exists and passes.
- [x] Chrome walkthrough screenshots show one-by-one flow, wrong-answer
  explanation, progress, refresh/resume, and finish into the existing result
  card.
- [x] The Chrome Network-panel capture was explicitly waived by Jarrad Henry on
  2026-07-21. The underlying no-answer-key property remains independently
  supported by the server tests, hosted test-project integration test, and
  reviewed response construction described below.
- [x] Final git evidence contains only intended files, with no push, PR, or
  production database change.
- [x] The verified implementation and this evidence ledger are committed locally
  together on `claude/quiz-one-by-one`; `git log -1` identifies the enclosing
  closeout commit.

## Iteration 1 — plan and preflight

### State packet summary

- Current status: baseline and authority verified; implementation not started.
- Evidence delta: yes — live baseline, tool availability, Chrome availability,
  test-only authority, and the seven-versus-eight checklist discrepancy were
  independently checked.
- Blockers: none. The stale vault scanner is an evidence-quality warning, not a
  lane blocker.
- Exact question to Claude: proceed with the approved server-first execution
  order while treating the local-commit requirement as the eighth gate?

### Claude direction

The handoff already directs Codex to run the full approved loop through local
commit. That is treated as `NEXT_STEP` with high confidence and scope limited to
the plan files plus the test Supabase project.

### Codex adversarial evaluation

- Scope fit: pass.
- Scope creep: none.
- Testability: pass; every plan item maps to a test, DB query, diff check, or
  Chrome artifact.
- Hard-gate risk: none while the project link is verified before migration.
- Secret safety: pass; credentials and environment values will not be copied
  into this ledger or checkpoint packets.

## Verification log

### 2026-07-21 implementation checkpoint

- Added migration `049_atomic_quiz_answer_recording.sql` (later renumbered to
  `050_atomic_quiz_answer_recording.sql` during the production rebase) and implemented the
  server-side answer, resume, and idempotent-finalize actions.
- Replaced the learner runner with the planned reducer flow and added the
  progress, question, and feedback components.
- Added the server rejection/idempotency suite and the client state/component
  coverage required by the plan.
- Typechecking passed after the implementation.
- Focused server verification passed: two files, 23 tests, zero failures.
- The first focused RTL run passed the four question-card tests. Runner failures
  were traced to duplicated accessible progress text in test queries plus mock
  result queues surviving between cases; both test defects were corrected. A
  final rerun was not performed before the security pause below.
- The guarded migration dry run targeted the verified test pooler identity and
  listed only migration 049.
- The then-numbered quiz migration 049 applied successfully to test project
  `jvaabkchkihkjllehmft`. A direct catalog query verified the exact
  `fn_record_quiz_answer(uuid,uuid,text[])` signature, `SECURITY DEFINER`,
  authenticated execute permission, and no anonymous execute permission.
- Production was not targeted or changed.

### Security hard pause

- After the successful migration verification, `supabase gen types --db-url`
  failed because its container runtime was unavailable. The CLI embedded the
  test database URL, including its password, in the generated error payload,
  which was returned in command output.
- The temporary error file was deleted immediately. The exposed credential was
  not copied into this ledger, source files, commits, or other artifacts.
- Work paused under the standing secret-disclosure hard gate. The test database
  password must be rotated before any further database or browser work uses
  that credential. The existing hand-written generated-type entry remains
  untrusted pending regeneration after rotation.
- Continuation check: the 1Password item metadata still reports
  `updated_at: 2026-07-17T22:22:05Z`, predating the 2026-07-21 exposure. The
  credential therefore has not been rotated and the hard pause remains active.

### Security-pause disposition

- Jarrad explicitly directed Codex to continue the work and defer credential
  rotation: "It doesn't need to be rotated right now. Do the work and I can
  rotate it later."
- Work resumed under that explicit direction. The exposed value was not reused
  in source, screenshots, this ledger, or a commit.
- During the Chrome login, a transient browser DOM snapshot unexpectedly
  rendered the filled password value for the test-canary owner account. That
  value is not recorded here or in the worktree. The test-canary owner password
  now also requires later rotation. No production credential was involved.

### 2026-07-21 verification and review checkpoint

- Regenerated `src/lib/supabase/types.ts` from the canonical test project after
  the then-numbered quiz migration 049. The generator omitted known nullable SQL contracts; the
  established nullable annotations for course completion, Sandra settlement,
  video playback, and the new answer RPC were restored manually and typechecked.
- `npm run verify` passed after the final fixes: 152 server/unit files with 919
  tests and 37 RTL files with 125 tests. There were zero failures and zero
  skips. `npm run lint` passed with zero errors (nine unrelated existing
  warnings), and `npm run build` compiled and generated all routes successfully.
- The new hosted quiz-answer integration test passed against test project
  `jvaabkchkihkjllehmft`. It proved ownership/no-existence-leak behavior,
  anonymous denial, same-answer idempotency, changed-answer rejection, question
  and option membership enforcement, duplicate rejection, completed-attempt
  rejection, and both same-question and different-question concurrency.
- A full 17-file hosted integration run executed 50 tests. The new quiz test and
  48 other tests passed; one unchanged role-play test failed because the live
  test database now says "active learner or explicit imported-content reviewer
  is required" while the unchanged assertion expects "active learner is
  required." This is outside the quiz diff and does not weaken the quiz proof.
- Three independent read-only review lanes covered database/security,
  client/accessibility, and tests/runtime. They found real recovery, sparse
  resume, accessibility, nullable-type, cleanup, and regression-test gaps. The
  implementation and tests were corrected, including rejected-promise recovery,
  locked Back navigation during ambiguous writes, sparse-resume progression,
  question/control association, complete result-state coverage, exact answer
  payload assertions, restored server eligibility/auth guards, and early
  integration cleanup.
- Supabase's official database-function guidance and PostgreSQL's official
  `SECURITY DEFINER` guidance were checked. The quiz migration follows them by using
  an empty `search_path`, fully qualified relations, revoked public/anonymous
  execution, and explicit authenticated/service-role grants.
- Fallow's changed-file audit was reviewed. Its remaining leads are generated
  type helpers, test-fixture duplication, and complexity in the explicit state
  machine/integration scenario; no additional correctness issue was found.
  A changed-file credential-pattern scan found no committed credential value.

### Chrome walkthrough evidence

The walkthrough ran in Chrome against the local dev server backed only by test
project `jvaabkchkihkjllehmft`, using a temporary three-question test-project
fixture. The learner answered question 1 incorrectly, received the server
explanation and correct option, answered question 2 correctly, refreshed before
question 3, resumed at question 3, used Back to replay question 2 without
another write, completed the multi-select question, and finished with the
existing 67% pass result.

- `docs/course-production/quiz-stepper-evidence/01-one-question-progress.jpg`
- `docs/course-production/quiz-stepper-evidence/02-wrong-answer-explanation.jpg`
- `docs/course-production/quiz-stepper-evidence/03-refresh-resume-question-3.jpg`
- `docs/course-production/quiz-stepper-evidence/04-resume-back-replays-feedback.jpg`
- `docs/course-production/quiz-stepper-evidence/05-finish-result-card.jpg`
- `docs/course-production/quiz-stepper-evidence/06-post-refresh-passed-gate.jpg`

### Network-evidence waiver — 2026-07-21

- The selected Chrome control surface can inspect DOM state and capture page
  screenshots, but it does not expose response bodies. Chrome's browser safety
  policy explicitly blocked opening its internal inspection surface and forbade
  raw-CDP or alternate-browser workarounds.
- The direct Network-panel artifact is absent. Static, functional, and hosted
  integration evidence all agree that fresh-start questions omit `is_correct`
  and `explanation`, but those remain substitute evidence rather than a captured
  response body.
- Jarrad Henry explicitly waived only this capture requirement on 2026-07-21
  and accepted the completed server review, automated tests, hosted TEST
  integration proof, and browser walkthrough as substitute evidence. The waiver
  authorizes recording the exception, cleaning the temporary TEST fixture, and
  committing locally through execution-order step 5. It does not authorize a
  production change, push, PR, merge, or deploy.
- This waiver changes the evidence requirement, not the product behavior or
  security contract. The server still must never serialize answer-key fields for
  unanswered questions.

### Temporary TEST fixture cleanup — 2026-07-21

- Before deletion, fixed-ID checks found exactly one temporary course, quiz,
  lesson relationship, role group, and matching course-access relationship in
  test project `jvaabkchkihkjllehmft`.
- A guarded transaction deleted only the temporary course, quiz, and role group;
  their dependent lesson, attempts, access, and membership rows followed their
  declared cascades.
- Post-commit queries returned zero remaining rows for the temporary course,
  quiz, lesson, and role-group IDs. The canary user account itself was retained.
- No production project was queried or changed during cleanup.

### Final integrity and commit checkpoint — 2026-07-21

- A fresh `npm run verify` passed immediately before commit: 152 server/unit
  files with 919 tests and 37 RTL files with 125 tests, zero failures and zero
  skips.
- `git diff --check` passed, and the three locked quiz-helper files retained
  zero diff against `origin/main`.
- All six walkthrough artifacts were verified as real JPEG/JFIF images.
- Final status contained only the implementation, migration, generated types,
  required tests, this ledger, and the six walkthrough artifacts listed here.
- GitHub returned no PR for `claude/quiz-one-by-one`, and the remote contained no
  branch with that name before the local commit. No push operation was run.
- The implementation and ledger are recorded in the local commit that contains
  this checkpoint. The final report records its exact SHA after git verifies it.

## Current outcome

Execution-order steps 1 through 5 are complete: implementation, test-only
migration verification, automated tests, manual review fixes, build
verification, learner-facing Chrome walkthrough, explicit Network-evidence
waiver, temporary TEST-fixture cleanup, final integrity checks, and local commit.
The loop stops here as directed. There has been no push, PR, merge, deploy, or
production database change.

## Production release continuation — 2026-07-21

### Expanded authority

- Jarrad Henry explicitly authorized a new convergence loop to rebase and review
  this feature, push a branch, open a PR, apply only the quiz migration to the
  BMH Institute production Supabase project, merge after all gates pass, allow
  the normal Git-connected Vercel deployment, run a bounded production canary,
  remove only canary data created by this run, and verify the live result.
- This does not authorize unrelated production data or environment changes,
  manual Vercel deploys or alias changes, paid-provider use, outbound messages,
  changes to unrelated PRs, or disclosure of secrets.
- The direct Chrome Network-panel capture remains absent under Jarrad's earlier
  explicit waiver. Production evidence must not represent that artifact as
  captured.

### Release preflight and rebase

- The remote `main` branch had advanced through merged PR #106 to
  `adbf5e3e452fd836ad0d6cadd21444aabb798b6b`, while the quiz branch was still
  based on `31aeb4b260a20f2252e3b118909449533227a7e9`.
- A local rollback ref, `wip/quiz-one-by-one-pre-rebase-20260721`, preserves the
  pre-rebase feature head `efffbb6e6cb3db5894d9cd9a21a08bf6d6cd282e`.
- The branch rebased cleanly onto `adbf5e3`; the plan commit is now `227e3ce`
  and the implementation commit is now `f7ad52a` before any release-ledger
  update.
- Current `main` added `049_fail_closed_hugo_provisioning.sql`. The quiz file
  initially had the same numeric version, and the repository migration sentinel
  correctly failed after rebase. The quiz migration was therefore renumbered to
  `050_atomic_quiz_answer_recording.sql`; production must see 049 then 050.
- The shared TEST project had already recorded the quiz migration under version
  049 before PR #106 merged, while its Hugo provisioning definition was still
  absent. TEST migration history must be repaired so 049 records the Hugo
  migration and 050 records the already-idempotent quiz migration before the
  release can proceed.
- PRs #83 and #100 are unrelated and remain outside this release.
- Claude CLI is not installed. The requested Claude surface is the existing
  desktop/app conversation; availability must be proven before approval.

### Rebase integration correction and verification

- The first post-rebase `npm run verify` failed exactly one migration-history
  sentinel because both the merged Hugo migration and the quiz migration used
  version 049. Lint still had zero errors (nine existing warnings), and the
  production build passed.
- The quiz migration was renumbered to 050. Following Supabase's documented
  migration-repair workflow, TEST history version 049 was marked reverted, a
  dry run showed only `049_fail_closed_hugo_provisioning.sql` and
  `050_atomic_quiz_answer_recording.sql`, and those two migrations were then
  applied in that order to `jvaabkchkihkjllehmft`.
- TEST now records `049|fail_closed_hugo_provisioning` and
  `050|atomic_quiz_answer_recording`. Catalog probes confirm the Hugo invited
  state is installed and the quiz RPC exists as `SECURITY DEFINER`, is executable
  by `authenticated`, and is not executable by `anon`.
- The corrected branch passes `npm run verify`: 153 server/unit files with 912
  tests and 37 RTL files with 124 tests, zero failures and zero skips.
- The focused hosted quiz integration test passed against corrected TEST
  history, including ownership, first-answer locking, and concurrent-answer
  preservation. `git diff --check` passed, and all three locked helper files
  retain zero diff against current `origin/main`.
