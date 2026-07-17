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

- [x] Runtime and database writes enforce ownership, access, prerequisites and server-side scoring.
- [x] Required videos persist watched ranges and require at least 90 percent watched coverage.
- [ ] The deterministic importer validates, uploads, applies, verifies and rolls back only manifest-owned records.
- [ ] Nineteen grouped lessons map to 29 approved videos across six sections.
- [x] Nineteen quizzes contain audited current questions with role-agnostic compensation content.
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

### 2026-07-16 DialPad stack reconciliation

- The newest vault evidence confirms DialPad remains the employee's manual
  outbound voice and manager-approved text tool. The evidence does not conflate
  that workflow with Sandra's current Sendillo provider or Jitter's Telnyx
  carrier; Jitter remains Jarrad-only until its Phase 2 exit and VA authorization
  decision.
- All 10 full-manifest and seven Tech Stack canary DialPad string values were
  reconciled. The two approved video cuts, four caption/transcript derivatives,
  and two learner guides were checksum-audited. No statement was contradicted,
  so no content edit or video recut is required.
- A machine-readable confirmation now records exact scope, source snapshots,
  full/canary reference digests, media/guide checksums, recheck triggers, and a
  one-week expiry at `2026-07-23T17:06:57-05:00`. The validator restores the
  DialPad blocker when that record is missing, stale, scope-changed, or
  mismatched to the selected manifest or approved assets. Immediate
  prepublication recheck remains mandatory even before expiry.
- This reconciliation made no provider call, upload, video edit, approval
  change, production mutation, or publication.

### 2026-07-16 Career Growth assessment reconciliation

- The entire stale 18-question Career Growth pool was replaced at its builder
  source. None of the old role ladder, promotion criteria, fixed readiness
  periods, daily-number expectations, first-consideration claims, management
  ownership, compensation, or earnings language remains in the learner
  assessment.
- The replacement keeps 18 curated questions, 10 randomized per attempt, an 80%
  pass threshold, answer randomization, explanations, and all three supported
  question types. Every item is grounded in practice, feedback, coachability,
  capability, current role expectations, or manager-confirmed written ownership.
- The in-app lesson objectives and guide, eight derived flashcards, and slot 19
  accessible guide PDF were rebuilt from the same role-agnostic source. The
  validator now fails closed on stale career promises and ungrounded questions.
  Two complete rebuilds were byte-identical, and the Tech Stack canary remained
  byte-identical.
- This content-only reconciliation changed no video, caption, transcript,
  artwork, approval, provider, upload, production record, or publication state.

### 2026-07-16 preapproval hardening

- Migration 018 was applied to `bmh-institute-test` only. The test migration
  ledger now matches local migrations 001 through 018, the private `content`
  bucket retained its existing MIME allowlist and added `text/markdown`, and
  all 16 database integration tests passed with the test project mapped to the
  application environment variables. Production was not changed.
- All 19 guide PDFs are tagged PDF 1.7 documents with language, title, logical
  heading/list structure, ParentTree mappings, embedded subset fonts, and
  selectable text. The deterministic rebuild and the semantic-graph validator
  run in `test:course-content`; the current 45 content tests, three caption
  tests, two semantic corruption tests, and 19-guide rebuild all pass. This is
  not a PDF/UA certification claim because PAC/veraPDF and manual assistive-
  technology review remain outside the available tool surface.
- Guide downloads remain present and checksum locked, but are deliberately not
  completion-required because the runtime has no download-progress operation.
  This removes a course-wide completion deadlock without removing the guides.
- Program and course artwork paths are selected only through learner-authorized
  rows, signed server-side, and rendered with a branded fallback. Assignment
  rubrics are now stored, editable with validation, and visible beside learner
  submissions during admin review.
- The held-video ledger now distinguishes six exact corrected cuts awaiting
  Jarrad review from three exact policy-defective source hashes that are
  terminal `changes_requested`. The known-bad Compensation Engine, Operator
  Playbook, and Career Growth hashes cannot be approved; their replacement
  scripts and edit specifications remain provider-call gated.
- The current manifest has zero structural/content errors and 82 publication
  blockers: six production Closer Lab IDs, nine held videos, 18 held-cut
  caption/transcript derivatives, 20 cover/lesson artworks, and 29 posters.
  DialPad confirmation is a dated warning, not an additional blocker, and must
  still be refreshed immediately before publication.
- A post-merge adversarial review reproduced six upload/rollback defects despite
  the focused tests passing: two pathname ownership races, incomplete rollback
  dependency coverage/atomicity, cleartext TUS credential targets, under-bound
  resume state, and approved draft uploads without integrity fields. They are
  release blockers resolved and independently retested in the final preapproval
  hardening pass below.

### 2026-07-16 final preapproval hardening and test-project proof

- Independent red-team passes found and fixed additional failures in the first
  hardening attempts: rollback confirmation of missing IDs, stale invite
  references, encoded TUS traversal, identifier-length mismatches, empty
  rollback graphs, persisted creation-endpoint resumes, raw media-path approval
  bypasses, shared-folder artwork laundering, non-atomic assignment ownership,
  partial fixture fingerprints, cross-schema cascade blind spots, and
  unverifiable cleanup approval/backup records.
- Migration 019 now binds every rollback entry to the deterministic
  `import_id + source_key` identity, requires the complete root graph, locks all
  dependent tables including invites, rejects missing or external rows before
  deletion, and confirms actual per-table delete counts. Upload failures never
  delete remote objects, staging cleanup preserves a quarantined tree, and TUS
  resume state is bound to a canonical HTTPS resource plus the complete asset
  identity and checksum.
- Migration 020 persists exact entity-bound artwork provenance
  (`content_import_id`, asset key, approved path, and checksum), supports one
  service-role claim and immutable reruns, returns entity-keyed signed URLs,
  and moves assignment ownership validation plus update into one database
  function. Direct content paths must resolve to an approved checksum-addressed
  asset in the same manifest namespace.
- Migration 021 contains 463 exact fixture identities with complete-row and
  complete-column fingerprints, including timestamps and all migration 020
  provenance fields. It fails closed on drift, partial state, future columns,
  future public or cross-schema foreign keys, stale approval evidence, stale or
  unverified backup evidence, and a missing restore rehearsal. It exposes no
  account, profile, or audit-history deletion path and remains unexecuted.
- The controller caught and corrected a stale production Supabase link before
  any push. It was relinked to `bmh-institute-test` (`jvaabkchkihkjllehmft`). A
  guarded dry run listed exactly migrations 019, 020, and 021; those migrations
  compiled and applied only there. The remote ledger now matches local 001
  through 021. Database lint has no errors; its two warnings concern the
  fixture canonicalizer being declared immutable while using stable JSON
  expressions and are recorded for final review.
- All 24 test-project integration tests pass: exact atomic rollback, empty and
  partial rollback rejection, missing-row preservation, invite and external
  dependency blocking, anonymous/authenticated RPC denial, artwork provenance
  claim/immutability, atomic assignment ownership, storage isolation, quiz
  answer isolation, data integrity, certificates, user deletion, and rate
  limiting. No production migration or data write occurred.
- Final merged application verification passes 455 unit tests, 91 RTL component
  tests, lint, typecheck, and the Next.js production build. The 45 course QA
  tests, three caption tests, two semantic guide tests, and deterministic
  rebuild of all 19 guides pass. The release validator remains at zero errors
  and 82 intentional blockers.
- Fresh staging verification found 79 exact approved assets and 76 held or
  missing asset blockers with zero errors. A new Tech Stack canary stage copied
  four independent files, remained blocked only by the program cover, slot 03
  thumbnail, and Tech Stack poster, and reused all four files on an immediate
  idempotent rerun. The earlier canary staging tree was preserved because its
  manifest checksum no longer matched after path hardening.

### 2026-07-16 final manual-review convergence

- Three independent review lanes challenged runtime/database security,
  import/media atomicity, and learner/admin behavior. Their findings were fixed
  and re-audited rather than accepted from the implementing agents' reports.
  The final clean pass covers forged and stranded video progress, completion
  reconciliation, assignment type/file/URL ownership, access-path locking,
  atomic import and stale-manifest refusal, fail-closed environment selection,
  required-block eligibility, rubric approval, persisted learner state,
  accessible desktop/mobile search, role-play announcements, artwork signing,
  required video duration, production Closer Lab IDs, and durable Jarrad-only
  video approval evidence.
- Migrations 022 and 023 were dry-run and then applied only to
  `bmh-institute-test` (`jvaabkchkihkjllehmft`). The remote migration ledger now
  matches local 001 through 023. Database lint has no errors and retains the two
  previously recorded fixture-canonicalizer volatility warnings. Production
  received no migration, data, storage, access, or publication change.
- The complete test-project integration suite passes 31 of 31 tests. This adds
  real proof for accessible-program lesson locking, atomic apply, late-failure
  rollback, idempotent reruns, exact reconciliation, stale-manifest refusal,
  anonymous denial, and full rollback to the earlier authorization, storage,
  certificate, integrity, deletion, and rate-limit coverage.
- Final merged verification passes 510 unit tests, 107 RTL component tests,
  typecheck, lint, and the Next.js production build. Course production QA passes
  46 Node tests, three caption tests, two semantic guide tests, and a
  deterministic rebuild check for all 19 accessible guides.
- Final manifest QA remains at zero structural errors, 82 intentional
  publication blockers, and one dated DialPad recheck warning. The full asset
  preflight verifies 79 approved files and reports 76 intentional held/missing
  blockers with zero integrity errors. The Tech Stack canary reuses all four
  verified files and remains blocked only by its three missing artwork assets.
- Fallow's changed-surface audit still reports expected static-analysis leads:
  direct-run production scripts, deliberate test/public exports, complexity in
  validators and generators, and the three zero-import drag-and-drop packages.
  No circular dependency or new proven release defect was found. Package and
  walkthrough cleanup stays deferred until the real manifest is accepted, as
  required by the deletion boundary.

### 2026-07-16 approval-surface and cross-app contract hardening

- The held-video review cards now identify each exact cut by course, module,
  lesson, lesson source key, and video-block source key. The verifier rejects
  duplicate or unmapped assets, and the reviewer runbook now carries an
  approval through checksum promotion, caption/transcript generation, review,
  manifest rebuild, and release validation. This closes the handoff gap without
  approving or altering any held file.
- Every required Closer Lab block now names its reviewed assignment explicitly:
  the two conversation scenarios map to section 3, scam-suspicious to section
  4, probate to section 5, and the two capstone scenarios to section 6. Both the
  source-manifest validator and runtime import validator reject shallow or
  unknown required scenario specifications.
- `closer-lab-test` was re-read and matched all six expected BMH role keys,
  personas, goals, rubric items, and link records. The companion Closer Lab
  branch records the same assignment mapping. Production IDs remain deliberately
  absent, so this does not satisfy the production-mapping publication gate.
- Institute-minted Closer Lab embed tokens now carry `aud: closer-lab`; the
  companion Closer Lab branch verifies that audience when present while
  retaining its existing rotation and completion-proof behavior.
- Current admin copy now uses learner terminology for access, monitoring,
  exports, and the operations runbook. The old export path remains as a
  compatibility route; the visible UI and generated filename use learner
  terminology. Walkthrough fixtures remain intact until real-course acceptance,
  consistent with the deletion boundary.
- Fresh combined verification passes 511 unit tests, 107 RTL component tests,
  47 course-production tests, lint, typecheck, both application production
  builds, and manifest validation. The manifest still reports zero errors, 82
  intentional publication blockers, and the dated DialPad recheck warning.

## Hard gates

- Jarrad must review the six corrected held cuts. The three policy-defective
  source hashes require replacement files and cannot be approved as-is.
- Jarrad must approve the three-image thumbnail pilot before batch thumbnail generation.
- Billing changes, new paid vendors and uncontrolled external provider use require immediate approval.
- Publishing and fixture deletion occur only after all acceptance evidence is complete.
