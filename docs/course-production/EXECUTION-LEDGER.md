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

## Hard gates

- Jarrad must approve the six corrected finished videos before their exact files become publishable.
- Jarrad must approve the three-image thumbnail pilot before batch thumbnail generation.
- Billing changes, new paid vendors and uncontrolled external provider use require immediate approval.
- Publishing and fixture deletion occur only after all acceptance evidence is complete.
