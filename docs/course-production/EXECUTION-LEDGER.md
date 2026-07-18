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
- [x] The deterministic importer validates, uploads, applies, verifies and rolls back only manifest-owned records in test-project and adversarial recovery coverage.
- [ ] The Tech Stack canary and complete real draft pass upload, apply, exact reconciliation and rollback against the unpublished QA hierarchy.
- [ ] Nineteen grouped lessons map to 29 approved videos across six sections
  (currently 22 approved and seven held).
- [x] Nineteen quizzes contain audited current questions with role-agnostic compensation content.
- [ ] Six assignments and six verified Closer Lab scenarios are mapped.
- [ ] Captions, transcripts, guides, flashcards, objectives and thumbnail assets are complete.
- [ ] Dummy walkthrough content is removed only after the real draft passes acceptance.
- [x] Automated tests, manual code review, authorization abuse tests and test-project importer rollback coverage pass for the current foundation.
- [ ] A final rollback rehearsal passes against the exact complete unpublished import before any learner video completion creates immutable history.
- [ ] The exact import is reapplied and reconciled after rehearsal, then desktop and mobile Chrome learner acceptance pass on the deployed surface.
- [ ] Sandra completion delivery and program certificate behavior pass.
- [x] Employee access remains disabled while any content, import or product gate is outstanding.

## Evidence log

Each subsection below is a dated historical snapshot. Counts in older entries
describe the manifest at that checkpoint; the current manifest truth is recorded
in the latest reconciliation entry.

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

### 2026-07-16 CI convergence evidence

- CI treats the private canonical held-video directory as optional. When it is
  unavailable, only the explicit media-only verification is skipped; the held
  review security, integrity, and local-server tests still run.
- Learner-facing pilot terminology and the export-route end-to-end selectors
  now match the current monitoring and export surfaces.
- The manual lesson-completion bypass is absent. The disposable text lesson is
  optional, and quiz and assignment completions are earned through learner and
  admin server operations rather than direct completion inserts.
- Disposable reviewed-assignment fixtures now include valid rubrics. The three
  affected local browser suites pass 6 of 6 tests. The full seeded suite passes
  8 tests; the cross-app Closer Lab case remains environment-gated and skipped
  in this local run.
- GitHub checks for commit `87d569c` passed: Verify in 2m 6s, Seeded Playwright
  E2E in 2m 14s, test-project migrations in 11s, and the Vercel preview.

### 2026-07-16 post-review recovery and cross-app hardening

- A second import/media review reproduced four recovery defects that the first
  restartability pass had missed: same-asset TUS entries could collide within
  one second, inspecting one Supabase endpoint could erase another endpoint's
  resume entry, a Storage outage could prevent database rollback, and
  `--state-root` was not reaching upload state. Resume entries now have unique
  keys, unrelated endpoint state is preserved, database settlement is receipted
  before independent storage inspection, and the CLI uses the requested state
  root for both upload and rollback state.
- The combined import regression suite passes 113 tests. Controller verification
  passes 555 unit tests, 109 RTL component tests, typecheck, lint, the production
  build, 47 course-production tests, three caption tests, two semantic guide
  tests, and the deterministic rebuild of all 19 accessible guides. A canary
  rollback with a custom state root produces the expected dry-run plan without
  touching a provider, database, or storage.
- The complete manifest still validates with zero structural errors and exactly
  one program, one course, six modules, 44 total lessons, 111 blocks, 19
  randomized quizzes, 342 questions, six assignments, and 155 assets. Its
  learner-content summary remains 19 grouped lessons, 29 videos, 152 flashcards,
  six Closer Lab scenarios, 19 guides, and 29 distinct posters. Publication
  blockers remain intentional approval or production-mapping gates.
- Closer Lab now uses directional current/previous secrets, rejects malformed or
  overlong learner claims, binds completion to the exact admitted token and
  unexpired 45-minute attempt capability, and preserves long-running legacy
  attempts without permitting new missing-audience admissions after cutoff. The
  legacy audience cutoff itself fails closed when configured more than 60
  minutes ahead. Independent review could not forge, renew, or extend this path.
- Closer Lab verification passes 595 unit tests with three provider-gated skips,
  276 RTL component tests, typecheck, and the production build. Its production
  dependency audit has no high or critical advisory; one low and two moderate
  transitive advisories remain.
- The earlier red Closer Lab Playwright run overlapped another run against the
  same persistent test project and shared test user. The competing run changed
  the profile from owner to member while the failing run exercised admin pages;
  screenshots, timestamps, the RLS denial, and a clean non-overlapping rerun
  confirm the collision. The E2E workflow now serializes all branches through a
  constant repository-wide concurrency group and never cancels the active
  cleanup path.
- Final changed-surface Fallow audits report no circular dependency or new
  proven release defect. Their remaining dead-code, dependency, duplication,
  and complexity leads stay in the acceptance-gated cleanup inventory; fixture
  and compatibility removal still waits for the real manifest to prove its
  references.
- No production migration, provider call, upload, import, storage deletion,
  employee access change, publication, billing change, or shared-data cleanup
  occurred during this convergence pass.

### 2026-07-16 artwork production ledger and reconciliation hardening

- The preapproval artwork plan is now an immutable, machine-checked production
  ledger: 21 masters, 49 final outputs, 18 new generation calls, and three
  existing pilot promotions. It records exact prompts, references, generation
  lineage, derivative recipes, file and pixel checksums, review evidence, and
  checksum-addressed storage paths without treating any pilot as approved.
- The artwork CLI supports initialization, verification, pilot approval and
  byte-preserving promotion, generated-master ingestion, deterministic
  derivatives, review, finalization, and manifest reconciliation. Writes are
  atomic, durable, and serialized across concurrent CLI processes; reruns
  preserve approved review state; corrections archive the rejected lineage;
  path traversal, symlinked write ancestors, transparency, animation, lossy
  WebP output, stale artifacts, impossible lifecycle states, incomplete
  evidence, and backdated transitions fail closed. Derivatives are staged and
  checked for duplicate poster pixels before publication, so a rejected master
  remains correctable.
- Manifest generation consumes only a completely finalized 49-record ledger.
  It independently verifies the real artwork bytes, dimensions, checksums,
  source and derivative provenance, review evidence, storage namespace, and
  canonical path before replacing a missing artwork record. It then runs the
  complete canonical workflow validator against the locked inventory, ledger,
  files, evidence, lineage, palette, and reconciled manifest before returning.
  A missing or preapproval ledger leaves the current manifest artwork
  byte-identical.
- The manifest builder now includes the 19 already-generated accessible guides
  with their exact approved paths, checksums, sizes, and download metadata. A
  one-step manifest build reproduces the tracked manifest byte-for-byte instead
  of temporarily downgrading guides to missing; an explicitly present malformed
  artwork ledger can no longer impersonate the optional-absent state.
- Card and poster normalization now contains the complete generated master in a
  1280 x 720 exact-blue frame before any intentional poster focus crop. Cards
  add 40 pixels of exact blue above and below to reach 1280 x 800; no card or
  cover recipe can crop the source.
- Pilot approval requires a structured affirmative artifact bound to the exact
  review request, production inventory, generation lineage, and ordered pilot
  checksums. The validator requires Jarrad Henry and an `approved` decision,
  while the runbook states plainly that the controller must obtain the real
  human response because local evidence is auditable rather than cryptographic
  identity proof.
- A synthetic finalized ledger reconciled all 49 assets into the real manifest,
  then passed the real importer validate, upload dry run, and apply dry run.
  Independent replay testing also proved that promotion and derivation are
  idempotent and that hostile manifest paths cannot override ledger-owned
  storage paths.
- Fresh controller verification passes 555 unit tests, 109 RTL tests, lint,
  typecheck, the production build, 66 course-production tests, three caption
  tests, two semantic-guide tests, the deterministic rebuild check for all 19
  guides, and 46 combined artwork contract, workflow, and real-import boundary
  tests. CI now runs the artwork workflow suite explicitly. The three pilots
  remain unchanged and unapproved; no new image was generated or uploaded.
- Dependency inspection confirms the new direct image processor is exactly
  `sharp@0.34.5`. The production audit has no high or critical advisory; one
  low development-tool advisory and two existing moderate framework advisories
  remain. No secret-bearing configuration was introduced.
- No production migration, provider call, upload, import, storage deletion,
  employee access change, publication, billing change, held-video mutation, or
  batch artwork generation occurred during this pass.

### 2026-07-17 continuation audit and preapproval fixes

- Draft PR checks on controller head `c875529` passed the test-project migration,
  Verify, seeded Playwright, and Vercel preview gates. A fresh full-manifest
  source preflight verified all 79 approved files and reported only the expected
  nine held videos plus 67 missing derivatives: 18 held-video caption/transcript
  records and 49 approval-gated artwork records. No integrity error was found.
- A real desktop-to-mobile replay exposed a Node 26 file-handle crash in the
  verified held-video server when a browser aborted range requests. The server
  now owns every media handle explicitly and closes it exactly once across
  completion, error, abort, response close, invalid range, HEAD, and integrity
  failure paths. Regression coverage aborts concurrent ranges for all nine
  videos and proves later desktop- and mobile-style loads still succeed. The
  real nine-video surface then rendered at 1440 by 900 and 390 by 844 with the
  expected six review-required and three replacement-required cards, no
  overflow or console errors, and the unchanged held-set lock
  `5fdbd88dd07aef9f8f3fde6502a07ac9169cca36440d8629dff00442640c2411`.
- The mobile dashboard had no reachable primary navigation despite its browser
  contract. A portal-backed modal drawer now exposes the complete learner/admin
  navigation below the desktop breakpoint with initial focus, background
  isolation, focus trapping, Escape/backdrop close, focus restoration, and
  body-scroll locking. Opening it closes compact lesson search, it releases its
  lock when the viewport crosses the desktop breakpoint, and browser coverage
  follows a drawer link through a real route transition. The
  production-readiness browser lifecycle now exercises exact lesson-search
  selection on desktop and at 390 pixels before continuing its existing flow.
- Fresh test-project scenario verification matched all six BMH role plays with
  no reconciliation issue. Fresh Institute integration execution initially
  exposed a harness-only environment alias gap in five server-action tests.
  The integration configuration now requires all three `TEST_SUPABASE_*`
  credentials, accepts only the exact durable Institute test project, and
  fails during configuration instead of returning green with skipped tests or
  falling through to a developer's production environment. With only the test
  variables supplied, all 31 live integration tests passed with zero skips,
  including atomic import/rollback, artwork provenance, answer isolation,
  storage authorization, data integrity, user deletion, certificates, access
  paths, and rate limiting.
- The checksum-backed July 16 database snapshot passed an isolated local
  PostgreSQL restore rehearsal. All application `public` catalog, activity,
  access, profile, and audit counts matched the captured fixture boundary;
  five lesson prerequisite references restored without an orphan, and the
  reconciliation evidence hash is
  `c74670492fb9870ddfa3e1b62ebea2c3f953e9500c89972faa0db95ea67fe3de`.
  The rehearsal used local compatibility shells for Supabase-managed auth and
  publication objects, so it clears the recorded lesson-circularity risk but
  does not replace the required fresh pre-cleanup backup or a managed
  auth/storage disaster rehearsal.
- The three replacement-only narration packages were passed through the BMH
  script humanization rules and independently reviewed. Their generated scripts
  remain role-agnostic and contain no pay promise, dollar figure, quota, fixed
  timeline, advancement guarantee, or visible chapter reference; all five
  recut contract tests pass. Validation proves that the packages remain marked
  with provider and render permission set to false; it does not prove provider
  inactivity. Independently, no provider command or API was invoked in this
  execution, and no render, caption, approval transition, or media mutation was
  performed. Any future rendering entrypoint must consume a checksum-bound
  human approval artifact and refuse execution while either permission remains
  false.
- Final adversarial review also found that the held-video runtime could be
  reopened after shutdown and then evade later cleanup. The runtime is now
  explicitly one-shot, rejects listening after shutdown begins, and covers the
  close-before-listen lifecycle alongside the abort and paused-client cases.
  Both explicit shutdown and file-integrity shutdown during startup passed
  100-iteration adversarial stress with no listening socket left behind.
- Final local acceptance after these repairs passed 563 unit tests, 114 RTL
  interface tests, 31 live test-project integration tests with zero skips, 72
  course-content checks, 17 artwork-workflow checks, lint, typecheck, and the
  production build. A local Chromium support run passed the admin shell, the
  320-pixel search-to-drawer-to-Certificates route, and the 390-to-1024-pixel
  breakpoint cleanup flow. This automated browser run remains supporting
  evidence; it does not replace the required final Chrome/DevTools acceptance
  on the deployed application.

### 2026-07-17 current manifest reconciliation

- The canonical manifest and caption validator now agree on 22 approved exact
  video/caption/transcript sets, seven held videos, and 14 missing caption or
  transcript derivatives.
- All 49 artwork outputs have been produced, but their manifest records remain
  missing placeholders until Jarrad approves the checksum-locked contact sheet.
  The six Closer Lab blocks still use pending production scenario IDs.
- The validator reports zero errors and 76 intentional publication blockers:
  seven held videos, 14 missing media derivatives, 49 artwork placeholders, and
  six pending production scenario IDs. It verifies 85 approved asset files;
  70 asset-level blockers plus the six scenario mappings make up the 76 total.
- Terms v10 and KPIs v12 are approved. Neither approval changes the seven held
  replacement-video records or promotes unapproved artwork.

## Hard gates

- Terms v10 and KPIs v12 are approved. Jarrad must still review the seven new
  policy-safe replacement cuts after provider production; source-evidence
  hashes marked `changes_requested` cannot be approved as-is.
- The V8 thumbnail direction is approved and the 49-asset batch is produced.
  Jarrad must approve the final checksum-locked contact sheet before artwork is
  promoted into the release manifest.
- Rollback rehearsal must precede the learner happy path. After a required video
  reaches completion, append-only completion history intentionally blocks
  destructive rollback; the course must therefore be reapplied and reconciled
  after rehearsal and before final learner acceptance.
- Billing changes, new paid vendors and uncontrolled external provider use require immediate approval.
- Publishing and fixture deletion occur only after all acceptance evidence is complete.
