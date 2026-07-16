# BMH Institute complete course execution ledger

## Goal

Implement the approved concurrent completion plan for the reusable BMH Institute platform and the first complete BMH employee training program.

## Baseline

- Baseline ref: `903ccb950bc1cff70e4a8476e70b71d99c5d1c2c`
- Integration branch: `codex/institute-complete-course-v1`
- Runtime branch: `codex/institute-runtime-security`
- Import branch: `codex/institute-import-media`
- Content branch: `codex/institute-course-content`
- Authority profile: production-aware. No production mutation before draft import gates.

## Tool preflight

- GitHub CLI: available and authenticated.
- Supabase CLI: available.
- FFmpeg and FFprobe: available.
- Poppler PDF rendering: available.
- Google Chrome: running and reserved for the final controlled acceptance pass.
- Claude desktop: running unrelated active sessions and must not be overwritten.
- Claude CLI: unavailable. Opening external Claude review is recorded as unavailable until a safe desktop session is available.

## Acceptance gates

- [ ] Runtime and database writes enforce ownership, access, prerequisites and server-side scoring.
- [ ] Required videos persist watched ranges and require at least 90 percent watched coverage.
- [ ] The deterministic importer validates, uploads, applies, verifies and rolls back only manifest-owned records.
- [ ] Nineteen grouped lessons map to 29 approved videos across six sections.
- [ ] Nineteen quizzes contain audited current questions with role-agnostic compensation content.
- [ ] Six assignments and six verified Closer Lab scenarios are mapped.
- [ ] Captions, transcripts, guides, flashcards, objectives and thumbnail assets are complete.
- [ ] Dummy walkthrough content is removed only after the real draft passes acceptance.
- [ ] Automated tests, manual review, authorization abuse tests and rollback rehearsal pass.
- [ ] Desktop and mobile Chrome acceptance pass on the deployed surface.
- [ ] Sandra completion delivery and program certificate behavior pass.
- [ ] Employee access remains disabled until every content and product gate passes.

## Evidence log

### 2026-07-16 opening preflight

- Current main checkout was 58 commits behind and contained extensive unrelated user work. It was not modified.
- A clean integration worktree and three isolated Wave 1 worktrees were created from current `origin/main`.
- An attempted GSD phase addition was removed completely before any commit after Jarrad challenged the workflow choice.
- Existing audit agents inherited Plan Mode and refused mutation. Fresh Default-mode execution agents replaced them.
- Untouched baseline verification passed: 64 unit files with 267 tests and 34 RTL files with 79 tests.
- Untouched production build passed. Baseline warnings are the Next.js middleware deprecation and Node `module.register()` deprecation.
- Dependency install reported 19 inherited audit findings: 2 low, 7 moderate, 9 high and 1 critical. Dependency remediation is tracked separately from course behavior so it cannot be hidden by this migration.
- The authenticated production project was confirmed as `bmh-institute` (`dhvfsyteqsxagokoerrx`). Its latest completed physical backup before implementation is backup `1130851936`, created at `2026-07-16T11:34:16.963Z`. PITR is not enabled.
- A read-only storage inventory found the `content` and `submissions` buckets with no listed objects. This must be rechecked immediately before import or fixture cleanup.
- The missing local PostgreSQL export runtime was installed without changing the shell profile. Private schema and data dumps were captured under `_codex_backups/bmh-institute-2026-07-16/` with a checksum-backed rollback record. The data-only dump warns about the circular `lessons` relationship, so a controlled restore rehearsal remains required before destructive cleanup.

### 2026-07-16 Wave 1 integration

- The runtime, deterministic importer, media/artwork support, full course manifest, and signed Closer Lab completion contract are integrated on the controller branch.
- The combined automated baseline now passes 344 Node tests and 89 browser-component tests, lint is clean, and the production build succeeds on Next.js 16.2.10.
- Direct production dependencies were upgraded until no high or critical production advisory remained. Two moderate advisories remain inside Next.js's bundled PostCSS dependency; the audit tool's offered fix is an invalid downgrade to Next.js 9 and was rejected.
- Migrations 015 through 017 were applied only to the isolated `bmh-institute-test` project. The remote migration ledger matches local migrations 001 through 017, and all 16 database integration tests pass there, including storage authorization, answer-key and explanation isolation, certificate behavior, and destructive user cleanup.
- Nineteen deterministic accessible learner-guide PDFs were generated, checksum-addressed, text-checked, rendered to images, and visually inspected. Two generator runs produced identical hashes.
- The isolated Tech Stack canary manifest validates structurally and remains release-blocked by exactly its unapproved artwork and media derivatives.
- Three thumbnail pilots and their 16:9 poster derivatives were generated and visually inspected. They remain deliberately absent from the release manifest until Jarrad approves the pilot.
- Independent caption review produced and approved checksum-locked VTT and transcript assets for 20 exact cuts. Compensation Engine, Career Growth, and Operator Playbook joined the six review-held cuts after transcription exposed fixed compensation, promotion, role-ladder, and dial-quota claims. The final caption QA state is 20 approved videos and nine held videos with no held derivative accidentally referenced for release.
- Adversarial runtime review closed direct quiz-explanation disclosure, rapid forged video progress, cross-import storage ownership, and final-segment unmount loss. The live test-project authorization suite passed after the append-only explanation migration.
- Six Closer Lab scenarios, six personas, 24 rubric goals, and 24 links were applied only to `closer-lab-test`. The signed-embed compatibility fix was reconciled with six expected role-play updates and exact verification; production mapping remains null and no provider call occurred.
- The post-approval artwork lane is fully specified without crossing the approval gate: one cover, 19 lesson cards, and 29 distinct video posters map exactly once to the manifest's 49 final paths. Exact prompts, pilot promotion rules, crop recipes, provenance fields, and approval records are deterministic and contract-tested; all records remain blocked pending pilot approval.
- A local held-video review page now embeds all nine exact held cuts from the canonical checkout. Its verifier checksum-locks every video plus the six review-evidence caption/transcript files, rejects any held-set drift, and confirms the generated review page is current. It does not upload, approve, transcode, or alter media.
- After those two review artifacts landed, lint, typechecking, all 344 unit tests, all 89 RTL tests, 18 content tests, the five artwork-contract tests, and the two held-review tests passed on the integration branch.

## Hard gates

- Jarrad must approve or request recuts for the nine held videos before their exact files become publishable.
- Jarrad must approve the three-image thumbnail pilot before batch thumbnail generation.
- Billing changes, new paid vendors and uncontrolled external provider use require immediate approval.
- Publishing and fixture deletion occur only after all acceptance evidence is complete.
