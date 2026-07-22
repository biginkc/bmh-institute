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
- Baseline: `origin/main` at `369881f` plus the production release and learner snapshots captured before mutation.
- Authority profile: production-aware with the user's explicit authorization for this scoped production import and verification.
- Exclusions: no billing changes, no unrelated course edits, no secret persistence, and no changes to external communications or providers.

## Acceptance gates

- [x] Fresh branch from current `origin/main` preserves all newer production work.
- [x] The actual legacy release artifact is archived, or exact-byte unavailability is documented alongside the closest tracked manifest and deterministic live graph export.
- [x] The sole active full manifest contains exactly 19 quizzes and 920 approved questions.
- [x] Humanizing the Lead contains 70 questions and `questions_per_attempt: null`.
- [x] Canary and full course QA are green without weakened assertions.
- [x] Released catalog revision preserves the immutable legacy receipt and stable program, course, lesson, and quiz identities.
- [x] Production is reconfirmed to have no completed attempts; disposable incomplete legacy attempts cannot resume with 10 questions.
- [x] Rollback artifacts and procedure exist before production mutation.
- [x] Typecheck, unit, integration, import, migration rehearsal, build, lint, and manual review gates pass locally; CI remains part of the merge gate.
- [x] Focused PR is merged and production serves the merged commit.
- [x] Production contains exactly 19 active quizzes and 920 active questions with per-quiz counts matching the approved ledger.
- [x] Chrome visibly proves the exact Humanizing lesson says `Question 1 of 70` with no blocking console or network failure.

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

- Status: complete.
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

### Iteration 3 - final content approval and release hardening

- Evidence delta: eight adversarial content-review iterations eliminated answer-key, policy, boilerplate, form-asymmetry, and semantic-gate defects. Claude's final checksum-bound v8 verdict is approved with no blocker or major finding.
- Final approval request SHA-256: `c9339772f865747148d8c1814734f271d31f8b4837d80e98f62fe673b585638f`.
- Final question-bank SHA-256: `7b92395c5582728d6a13f49c36542d54a709ecbe87ec06787925b15019ac4425`.
- Final active manifest SHA-256: `c7d80fece3a51daf418d4f6953619d092a9b7b6e49f8d1c3afe3b02f4c0234d7`.
- Final released quiz-graph SHA-256: `d2b9fc182b7ca72f76ce038eac8c5b37446ba999fce5a269699802812177c78a` (19 quizzes, 920 questions, 3,678 options; Humanizing 70; all attempt caps null).
- Final hosted rehearsal: forward revision reconciled 342/1,292 to 920/3,678, invalidated one disposable incomplete attempt, preserved the immutable legacy receipt, rolled back exactly to 342/1,292, and refused a second rollback. The transaction rolled back all rehearsal state.
- Final local gates: 174 Vitest files / 1,026 tests; full course-content, caption, guide, quiz-bank, and deterministic-build QA; TypeScript; optimized Next.js build; lint with zero errors and ten pre-existing warnings; `git diff --check`; and adversarial full-diff review all pass.
- Manual-review correction: updated stale successor-bank provenance in the legacy archive metadata and added a regression assertion binding it to the active bank checksum.
- Claude verdict: approved for content. A stale graph-hash test found by Claude was repinned to the exact v8 graph and the full suite rerun green.
- Remaining gates: commit/push, PR CI, technical diff review, merge/deployment identity, controlled production revision, reconciliation, and authenticated Chrome proof.
- Blockers: none.

### Iteration 4 - CI integration repair and technical-review closure

- GitHub CI correctly rejected head `7112c35` because the final v8 question-bank checksum had not propagated to the Tech Stack canary, three learner guides still reflected pre-final generation state, and several QA assertions assumed the developer's local canonical media paths.
- Regenerated only the three stale two-page guides (Slots 17, 18, and 19) from the final approved bank. All six rendered pages were visually inspected and the accessibility/semantic/reproducibility checks pass. Guide records SHA-256 is now `70f94a88356cf0cddf3567295122733980b04af6cc4c96a23687c8d717f473c3`.
- Rebuilt the full manifest, canary, stack confirmation binding, and combined review index. The final active manifest SHA-256 is now `440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d`; the approved released quiz graph remains `d2b9fc182b7ca72f76ce038eac8c5b37446ba999fce5a269699802812177c78a`.
- Claude's independent technical review of base `369881f` to head `7112c35` returned `REQUEST_CHANGES`: the content ledger needed an explicit human-governance authorization record, and the server-side revision rehearsal needed to execute in CI with missing confirmation, compare-and-swap, drift, and immutability refusals.
- Jarrad's explicit end-to-end delegation was recorded truthfully as authorization for Claude's exact checksum-bound content approval to satisfy the content gate; it does not claim Jarrad personally reviewed the 920 questions, and merge/production proof remain separate gates. Approval ledger SHA-256 is `60f064bf2f070fa9f3bb47dbc260ee85daae7806e22b7ca3660b0a9ba91866a1`.
- The real forward/rollback rehearsal is now wired into the PostgreSQL 15/16/17 PR matrix. It behaviorally refuses confirmation mismatch, stale compare-and-swap state, drifted legacy configuration, completed activity, revision update/delete, reviewer evidence, and a second rollback.
- Hosted test evidence: the expanded rehearsal passed on Supabase test project `jvaabkchkihkjllehmft` at `2026-07-22T13:49:16Z`; forward reconciled 19/342/1,292 to 19/920/3,678, rollback restored 19/342/1,292, and the transaction rolled back. Evidence is checksum-bound in `docs/course-production/released-quiz-revision-rehearsal-2026-07-22.json`.
- Additional hardening: archived manifest JSON now has explicit attributes, the generic semantic validator refuses the embedded 342-question graph for the canonical import ID, the rollback loader requires exactly 1,292 legacy options, and throw paths for non-920/capped graphs are behaviorally tested.
- Claude verdict: prior technical verdict remains `REQUEST_CHANGES` for head `7112c35`; a fresh review of the corrected commit is required before merge.
- Remaining gates: full local suite, corrected commit/push, green PR CI, fresh Claude technical approval, rollback tag, merge/deployment identity, controlled production revision, reconciliation, and authenticated Chrome proof.
- Blockers: none.

### Iteration 5 - reviewed merge, production revision, and authenticated proof

- Final branch head `6cc04293c4ed94c97fb56ee4fd5008c9299fcafc` received Claude's independent `APPROVE` verdict with no blocker or major finding. Both prior major findings were closed with PostgreSQL 15/16/17 behavioral evidence and checksum-bound governance evidence.
- PR #117 passed all merge-gate checks, including 174 Vitest files / 1,028 tests, course QA, build/lint, the PostgreSQL 15/16/17 released-revision matrix, and the reconciled seeded Playwright test. It merged to `main` as `5f3da0cef578eadca713eae6374a78923060d902` at `2026-07-22T14:26:48Z`.
- Rollback point `bmh-exhaustive-quiz-pre-release-20260722` was created and pushed before merge at the prior production commit `369881f2dda2965d37f60d793c9ba9f555a40bb2`; its annotation binds the legacy manifest and immutable receipt checksums.
- Vercel production deployment `dpl_8zbg3qCwqvwfVkCDkUeBnsXEgz8A` is `Ready`, targets the exact merge SHA on `main`, and automatically owns the verified `institute.bmhgroupkc.com` custom domain. No manual alias mutation was required.
- The production revision migration was applied atomically with its schema-history record. The released import advanced the stable catalog to revision 2 and reconciled 19 quizzes / 342 questions / 1,292 options to 19 / 920 / 3,678 while invalidating the one explicitly disposable incomplete legacy attempt.
- Independent production reconciliation preserved the original immutable manifest receipt `71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c`, activated manifest `440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d`, matched catalog `ca42e3d6347a71f46bd1aabee6c7b5c9fc570e797473865ceee30d4fe2a36ae0` and graph `d2b9fc182b7ca72f76ce038eac8c5b37446ba999fce5a269699802812177c78a`, retained all stable identities, left every attempt cap null, and found zero live attempts or reviewer evidence.
- At `2026-07-22 09:36 CDT`, authenticated Chrome on the exact production URL visibly showed Humanizing the Lead `Question 1 of 70`. Codex answered and locked questions 1 and 2, advanced to question 3, reloaded, resumed at question 3, navigated back to question 1, and observed zero browser warnings or errors. The verified production tab was left open for Jarrad.
- Final status: all acceptance gates satisfied; no blockers.
