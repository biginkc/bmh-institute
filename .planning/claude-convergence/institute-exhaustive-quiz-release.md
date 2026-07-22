# Institute exhaustive quiz release convergence ledger

## Goal

- Goal ID: `institute-exhaustive-quiz-release`
- Replace the legacy capped BMH Employee Training quiz inventory with the approved exhaustive 920-question bank.
- Archive the legacy released manifest or the strongest exact reconstruction available.
- Preserve stable catalog identity. Jarrad confirmed there are no real learners, so scoped disposable quiz attempts may be removed.
- Merge, deploy, import, reconcile, and prove the production Humanizing the Lead quiz visibly serves all 70 questions.

## Plan alignment

- Plan source: user-provided goal in the active Codex task.
- Repo plan anchor: `.planning/PROJECT.md` core value that learners can take quizzes without supervision.
- Baseline: `origin/main` at `d536859` plus the production release and learner snapshots captured before mutation.
- Authority profile: production-aware with the user's explicit authorization for this scoped production import and verification.
- Exclusions: no billing changes, no unrelated course edits, no secret persistence, and no changes to external communications or providers.

## Acceptance gates

- [x] Fresh branch from current `origin/main` preserves all newer production work.
- [x] The actual legacy release artifact is archived, or exact-byte unavailability is documented alongside the closest tracked manifest and deterministic live graph export.
- [x] The sole active full manifest contains exactly 19 quizzes and 920 approved questions.
- [x] Humanizing the Lead contains 70 questions and `questions_per_attempt: null`.
- [x] Canary and full course QA are green without weakened assertions.
- [ ] Released catalog revision preserves the immutable legacy receipt and stable program, course, lesson, and quiz identities.
- [x] Production is reconfirmed to have no completed attempts; disposable incomplete legacy attempts cannot resume with 10 questions.
- [x] Rollback artifacts and procedure exist before production mutation.
- [ ] Typecheck, unit, integration, import, migration rehearsal, build, lint, CI, and manual review gates pass as applicable.
- [ ] Focused PR is merged and production serves the merged commit.
- [ ] Production contains exactly 19 active quizzes and 920 active questions with per-quiz counts matching the approved ledger.
- [ ] Chrome visibly proves the exact Humanizing lesson says `Question 1 of 70` with no blocking console or network failure.

## Intended test coverage before behavior changes

- Manifest generation is deterministic and cannot select the legacy capped configuration.
- Full and canary manifests share the approved question-bank identity and expected per-slot counts.
- A released import can accept an audited revision without changing deterministic catalog IDs or deleting its historical receipt.
- The release refuses unsafe completed-attempt states and removes only disposable incomplete legacy attempts observed in production.
- Exact reconciliation refuses unapproved rows, duplicate courses, and mismatched release evidence.

## Transport and tool preflight

- Primary Claude surface: Claude desktop Code surface.
- Desktop state: reachable and visually inspectable. At preflight it was actively finishing an unrelated BMH Institute lesson-load review, so Codex did not interrupt or overwrite it.
- Claude CLI fallback: unavailable because `claude` is not installed on `PATH`.
- Chrome proof path: browser-client plugin present. The current authenticated Chrome surface reproduced `Question 1 of 10` before implementation.
- Provider CLIs: `gh`, `vercel`, and `supabase` are installed.
- Secret reads: use only the `BMH Secrets` 1Password service account.

## Iterations

### Iteration 0 - baseline and preflight

- Status: in progress.
- Evidence delta: fresh worktree created from `origin/main` at `d536859`.
- Rebuild source: `claude/quiz-rebuild-977` is 8 commits ahead and 70 behind current main. It will not be merged wholesale.
- Initial source diff: question bank, distractor reviews, manifest pipeline, approval ledger, canary QA, and related course QA.
- Claude verdict: pending once a non-interrupting desktop session is available.
- Blockers: none for current read-only investigation and local implementation planning.

### Iteration 1 - selective transplant and release-revision rehearsal

- Evidence delta: selectively transplanted the question-bank pipeline and checksum-bound approvals without merging the stale rebuild branch or reintroducing deferred role plays.
- Exact legacy artifact: recovered the production manifest bytes at SHA-256 `71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c` and placed them under the non-importable archive directory with release metadata.
- Active manifest: deterministic SHA-256 `1c388b80a8158ecce5ebb3eecf606052d359b5289a12e8a0f36e9327d64cc66e`, 19 quizzes, 920 questions, all exhaustive.
- Production baseline: 19 quizzes, 342 questions, one incomplete Humanizing attempt, zero completed attempts.
- Revision design: immutable original receipt plus append-only active revisions; stable imported IDs are retained; only quiz configuration, questions, and options are reconciled.
- Test-project rehearsal: migration parsed and executed on `bmh-institute-test`; transaction-scoped legacy seed revised 342 to 920 and rolled back 920 to 342; revision 2 and rollback revision 3 both reconciled; the transaction left zero rehearsal rows, and the rehearsal-only untracked schema objects were removed afterward.
- Rehearsal hashes: legacy manifest `71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c`; rehearsed exhaustive quiz graph remains `da40fa0a001c38d4c9175f68a1add421742fa65a6075bae986a4ffbad4960b10` after downstream guide regeneration.
- Exact exhaustive graph: 19 quizzes, 920 questions, 3,678 answer options; client graph SHA-256 `da40fa0a001c38d4c9175f68a1add421742fa65a6075bae986a4ffbad4960b10`.
- The production controller now exposes checksum-bound `plan`, `apply`, `verify`, and compare-and-swap `rollback` commands; rollback still refuses new completed attempts or reviewer-authored answer evidence.
- QA delta: the full course-content suite exposed portability and validator-assertion drift after the bank became the default. The fixture now acknowledges the repository-bound approved bank, and the KPI mutation assertion matches the validator's actual bank-mismatch error without relaxing enforcement. Focused revision/migration/operations tests pass 19/19 and TypeScript typecheck passes.
- Claude verdict: pending after Codex manual review of the completed diff.
- Blockers: none.

### Iteration 2 - current-main integration and downstream guide reconciliation

- Evidence delta: integrated `origin/main` at `369881f`, including the lesson-load release and the two migrations already present on the hosted test project.
- Hosted gates: test-project migration ledger now matches local through `20260722130000`; all 52 integration tests and all 28 import-provider acceptance tests pass.
- Downstream mismatch found: every learner guide's quick-review page still represented the prior manifest flashcards. All 19 two-page PDFs were deterministically regenerated from the approved exhaustive pools.
- PDF review: semantic/accessibility checks passed and all 38 rendered pages were visually inspected with no clipping, overlap, broken glyphs, or layout defects. The course-QA guide ledger binds all 19 regenerated files at records SHA-256 `11df12fb7455e4857190924dc2b00e2c5b34093c8ec078f8d900edb44007f5ab`.
- The current stack confirmation was rebound to the regenerated Slot 3 and Slot 18 guide checksums after both PDFs were re-audited with zero DialPad references.
- Final active manifest SHA-256 is `1c388b80a8158ecce5ebb3eecf606052d359b5289a12e8a0f36e9327d64cc66e`; quiz graph SHA-256 remains `da40fa0a001c38d4c9175f68a1add421742fa65a6075bae986a4ffbad4960b10`.
- Local gates: typecheck; lint with zero errors; 1,023 unit tests; 135 RTL component tests; 177 course-content tests plus caption and guide semantic/reproducibility checks; and the optimized Next.js production build all pass.
- Claude verdict: pending after Codex manual review of the completed diff.
- Blockers: none.
