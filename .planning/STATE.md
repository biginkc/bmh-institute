---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Internal Pilot Operations
status: planning
stopped_at: Phase 6 context gathered
last_updated: "2026-05-09T10:39:48.216Z"
last_activity: 2026-05-09 - Milestone v1.1 started
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-30)

**Core value:** A VA can sign in via an admin invite, work through assigned programs and courses on their own time, take quizzes and submit assignments without supervision, and receive a certificate when they finish. Admins can author content, manage learners, review submissions, and see who is making progress without leaving the platform.
**Current focus:** v1.1 Internal Pilot Operations

## Current Position

Phase: Not started (defining requirements)
Plan: -
Status: Planning
Last activity: 2026-05-09 - Milestone v1.1 started

## Performance Metrics

**Velocity:**

- Total plans completed: 1 (in Phase 01.1)
- Average duration: ~5 min
- Total execution time: ~5 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01.1 | 1 | ~5 min | ~5 min |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01.1 P1 | ~5m | 3 tasks | 5 files |
| Phase 01.1 P2 | ~12m | 3 tasks | 4 files |
| Phase 01.1 P3 | ~9m | 3 tasks | 7 files |

## Accumulated Context

### Roadmap Evolution

- Phase 01.1 inserted after Phase 1: Testing Coverage Parity: bring repo to Sandra CRM testing standard (RTL config, Playwright e2e dir, deps, scripts) and replace phase 1 HUMAN-UAT items with automated specs (URGENT)
- Phase 2 planned as three file-disjoint hardening plans: 02-1 sanitize HTML, 02-2 sandbox embed iframes, 02-3 password reset rate limits

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Milestone init: First GSD-managed milestone is a hardening pass, not features. Coarse granularity, parallel execution, YOLO mode.
- TDD rule: Test-first execution remains the default for meaningful changes; continue without waiting unless Jarrad asks for a review gate or risk requires one.
- 2026-05-01 (Plan 01.1-1): RTL config and setup mirror Sandra CRM verbatim including the localStorage shim. Vitest 4 transforms TSX natively so no @vitejs/plugin-react. Failing-tests commit lands with HUSKY=0 because the harness has not been installed yet; the harness commit runs the full hook end-to-end.
- 2026-05-01 (Plan 01.1-2): e2e fixtures expose adminClient + ensureTestUser + prod-ref guard only; write-path helpers deferred until Path B/C lock
- 2026-05-01 (Plan 01.1-2): BMH e2e fixtures use untyped SupabaseClient (src/lib/supabase/types.ts does not exist; TYPE-01 territory in Phase 4)
- 2026-05-01 (Plan 01.1-3): storage-state strategy locked as in-spec opt-out via test.use storageState empty — Option 1, smallest delta, no learner-only account on prod
- 2026-05-01 (Plan 01.1-3): Path A locked — destructive HARDEN-02 and HARDEN-03 UI variant remain manual until a write-capable test environment exists
- 2026-05-01 (Plan 01.1-3): 01-HUMAN-UAT.md status changed to closed-with-deferrals; file is a closed historical record
- 2026-05-08 (Phase 2 repair): Phase 2 has three plans per 02-CONTEXT.md D-E1. The missing 02-3 password-reset-rate-limit plan was regenerated from 02-CONTEXT.md, 02-RESEARCH.md, and 02-PATTERNS.md. ROADMAP and REQUIREMENTS now mark HARDEN-05/HARDEN-06 as planned, not executed.
- 2026-05-08 (Plan 02-1): Text block and certificate HTML sanitizers use sanitize-html on write. Existing render paths stay unchanged. Certificate template writes have no admin UI today, so the shipped enforcement is sanitizer library plus manual backfill script.
- 2026-05-08 (Plan 02-2): Embed block iframes render with the locked sandbox value and embed saves reject non-https iframe_src values before writing. Video iframes remain unchanged per D-B2.
- 2026-05-08 (Plan 02-3): Forgot-password and set-password now use durable Postgres-backed rate-limit gates before Supabase auth calls. Forgot-password denies silently; set-password denies with retry copy.
- 2026-05-08 (Phase 3): Data integrity work uses migration 012 for transactional role-group rewrites, transactional module reorder, and atomic certificate number counters. Assignment file uploads are server-validated against the authenticated user's storage prefix.
- 2026-05-08 (Phase 4 planning): TYPE-01 runs first, followed by admin submissions unit coverage, certificate trigger integration, and write-path e2e.
- 2026-05-08 (Phase 4 TEST-03): Durable write-path Playwright automation was deferred to GitHub issue #2 after manual production Playwright verification covered login, course visibility, quiz submit, assignment submit/revision/approval, certificates, file upload, and forgot-password success. Invite acceptance waits for non-prod email capture.
- 2026-05-08 (v1 audit): v1 Production Hardening closed as pass with tracked deferral. TEST-03 was tracked in GitHub issue #2. PR #1 was closed because role-play embed overlaps future EMBD-01..05.
- 2026-05-08 (Phase 5 planning): Ecosystem navigation alignment is the next milestone. The first plan implements the shared BMH fixed topbar, 256px left nav, active left-border nav state, PageHeader foundation, admin-only nav visibility, pending submissions badge preservation, profile access, sign-out, and responsive shell behavior.
- 2026-05-08 (Phase 5 complete): Implemented the shared fixed topbar and left nav shell, mobile primary nav, active left-border nav style, PageHeader foundation, and PageHeader usage on primary learner/admin pages. Added RTL sidebar coverage and Playwright shell smoke coverage. `npm run verify` and local Playwright shell smoke passed.
- 2026-05-09 (quick task): BMH Institute now consumes `@sandra/tokens` from `../Sandra Design System`, imports the shared token CSS in `globals.css`, adds the registry-style `BrandLockup` component locally, uses webpack for local dev to resolve linked design-system CSS, and covers the package contract with `src/app/globals.test.ts`.
- 2026-05-09 (quick task): Added durable non-production Playwright write-path coverage for issue #2. The suite creates disposable users/content, drives learner/admin LMS writes through the browser, validates certificate visibility, checks unassigned learner denial, and keeps invite acceptance separate. Local `npm run verify` passed, and PR #39 CI passed both `Verify` and `Seeded Playwright E2E`.
- 2026-05-09 (quick task): Added invite acceptance coverage using Supabase Admin `generateLink({ type: "invite" })` in the non-production test project. This drives the real browser through the invite action link, `/auth/callback`, first password setup, dashboard access, and DB assertions for accepted invite/profile/role group state. It also fixed hash-token invite callbacks by adding a browser bridge and `/auth/apply-invite` route. Local `npm run verify` passed, and PR #40 CI passed both `Verify` and `Seeded Playwright E2E`.
- 2026-05-09 (quick task): Defined the performance trigger policy for GitHub issue #9 in `docs/performance-thresholds.md`. PERF-01..03 remain parked until route timing, signed URL timing, production-readiness duration, or volume thresholds are breached.
- 2026-05-09 (quick task): Ran production readiness from latest `main` after PRs #40 and #41. GitHub Actions run `25595576897` passed in 1m44s with 2 passed and 1 skipped for the known email-link capture gap. Local DNS check still returned no A or CNAME answer for `institute.bmhgroupkc.com`.
- 2026-05-09 (quick task): Configured `institute.bmhgroupkc.com` in Tailor Brands/GoDaddy DNS with `A institute 76.76.21.21`, issued Vercel certificate `cert_KhnuksU3ftVPXtOglGh0EmKv`, updated GitHub secret `E2E_PROD_BASE_URL` to `https://institute.bmhgroupkc.com`, and verified GitHub Actions production-readiness run `25596039223` passed from `main`.
- 2026-05-09 (quick task): Added gated production email-link capture. Production readiness can now retrieve real Supabase invite and recovery links from an IMAP mailbox, complete invite acceptance and password reset in Playwright, and skip clearly until `PROD_READINESS_EMAIL_INBOX` and `PROD_READINESS_EMAIL_IMAP_PASS` are configured.
- 2026-05-09 (quick task): Set Vercel production `NEXT_PUBLIC_APP_URL` to `https://institute.bmhgroupkc.com`, redeployed current `main` to `sandra-university-ogb6o1qnt-jarrad-5416s-projects.vercel.app`, aliased `institute.bmhgroupkc.com` to that deployment, and verified GitHub Actions production-readiness run `25596438899` passed afterward.

### Pending Todos

None yet.

### Concerns

- v1.1 should stay focused on the first real internal pilot. Sandra Practice embed work and performance threshold work remain parked until their triggers are met.
- Spending changes, provider changes, or infrastructure changes still require explicit approval.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Role-play embed | EMBD-01..05 | v2 | Milestone init |
| Performance | PERF-01..03 | v2 | Milestone init |
| Quick task | sandra-design-system-stitch-pass | acknowledged at close; archived by Phase 02.5 records | 2026-05-09 milestone close |
| UAT | Phase 01 HUMAN-UAT closed-with-deferrals | acknowledged at close; superseded by later automation | 2026-05-09 milestone close |

## Session Continuity

Last session: 2026-05-09T10:39:48.212Z
Stopped at: Phase 6 context gathered
Resume file: .planning/phases/06-pilot-cohort-setup/06-CONTEXT.md
Session handoff: .planning/STATE.md

### 2026-05-08 - Phase 2 verification complete

- Wrote `.planning/phases/02-content-safety-and-rate-limiting/02-VERIFICATION.md`.
- `npm run verify` passed: TypeScript, 157 unit tests, 5 RTL tests.
- `npm run test:integration -- src/lib/rate-limit/check.integration.test.ts` skipped cleanly because `.env.test.local` lacks `TEST_SUPABASE_*` values.
- `E2E_PROD_BASE_URL=http://localhost:3100 npm run test:prod -- e2e-prod/embed-sandbox.spec.ts` passed.
- Verdict: PASS with deployment prerequisites.

### 2026-05-08 - Phase 3 verification complete

- Added `.planning/phases/03-data-integrity/` plans, summaries, and verification.
- Added `supabase/migrations/012_data_integrity.sql`.
- `setUserRoleGroups` and `saveUserSettings` now call transactional RPCs.
- `moveModule` now calls transactional RPC `fn_move_module`.
- `submitAssignment` rejects file paths outside `${user.id}/` before insert.
- Added unit coverage for all four app action surfaces.
- Added gated integration coverage in `src/lib/data-integrity.integration.test.ts`.
- Applied migration 012 to linked Supabase and repaired migration history.
- Linked Supabase checks passed for role-group rollback, module sort-order safety, and 20 concurrent certificate number reservations.
- Deployed production app to `https://sandra-university-5sh1s1zin-jarrad-5416s-projects.vercel.app`.
- Production throwaway-user login smoke passed and the temporary auth user was deleted.
- `npm run verify` passed.

### 2026-05-08 - Phase 4 planned

- Added `.planning/phases/04-type-safety-and-test-coverage/04-CONTEXT.md`.
- Added four Phase 4 plan files:
  - `04-1-supabase-generated-types-PLAN.md`
  - `04-2-unit-coverage-gaps-PLAN.md`
  - `04-3-certificate-trigger-integration-PLAN.md`
  - `04-4-write-path-e2e-PLAN.md`
- Roadmap updated to 0/4 planned for Phase 4.

### 2026-05-08 - Phase 4 plans 04-1 and 04-2 complete

- Generated `src/lib/supabase/types.ts` from linked Supabase.
- Wired generated `Database` types into Supabase clients.
- Removed `as string`, `as number`, and `as boolean` assertions from lesson and admin report surfaces.
- Added admin submissions action unit coverage.
- Fixed admin submissions profile embedding with `profiles!assignment_submissions_user_id_fkey`.
- `npm run verify` passed.
- Deployed production app to `https://sandra-university-qnyae6rsn-jarrad-5416s-projects.vercel.app`.
- Production throwaway-user login smoke passed and the temporary auth user was deleted.

### 2026-05-08 - Phase 4 plan 04-3 complete

- Added trigger-driven certificate pipeline integration coverage.
- The test completes a required content block through `user_block_progress` and asserts both course and program certificate issuance.
- `vitest.integration.config.ts` now allows shell-provided `TEST_SUPABASE_*` values.
- The test passed against linked Supabase with service-role env injected from the Supabase CLI.
- `npm run verify` passed.

### 2026-05-08 - Phase 4 plan 04-4 deferred to issue #2

- Created GitHub issue #2 for durable Playwright write-path coverage.
- Manual Playwright verification against production confirmed:
  - admin login
  - learner login
  - learner dashboard assigned program
  - course lesson visibility
  - quiz submission and pass state
  - text assignment submission
  - admin revision request
  - learner revision resubmission
  - admin approval
  - learner approved state
  - certificate UI visibility
  - file upload assignment submission
  - forgot-password success state
- Invite send and acceptance were not fully confirmed because Supabase email delivery limits were hit.

### 2026-05-08 - Phase 2 plan 02-3 complete

- Added `supabase/migrations/011_auth_rate_limits.sql`.
- Added `src/lib/rate-limit/ip.ts` and `src/lib/rate-limit/check.ts`.
- Forgot-password now checks IP and normalized email before calling `resetPasswordForEmail`; denies return silent success.
- Set-password now checks IP and authenticated user email before calling `updateUser`; denies return retry copy.
- Unit tests pass for helper behavior and both auth actions.
- Integration test exists but skipped locally because `.env.test.local` lacks `TEST_SUPABASE_*` keys.
- Verification passed: `npm run verify`.

### 2026-05-08 - Phase 2 plan 02-2 complete

- `EmbedBlock` now renders `sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"`.
- `updateBlock` now validates embed `iframe_src` values start with `https://` after trimming whitespace.
- `blocks-editor.tsx` now shows the admin-trusted helper note under the iframe source input.
- Added RTL coverage in `src/components/content-blocks.test.tsx`.
- Extended `actions.test.ts` with embed branch coverage and text sanitizer branch preservation.
- Verification passed: `npm run verify`.
- Added `e2e-prod/embed-sandbox.spec.ts` after implementation to confirm the real browser flow.
- Live prod URL run failed because the deployment still served older code. Local dev against the prod DB passed with `E2E_PROD_BASE_URL=http://localhost:3100 npm run test:prod -- e2e-prod/embed-sandbox.spec.ts`.

### 2026-05-08 - Phase 2 plan 02-1 complete

- Added `sanitize-html`, `@types/sanitize-html`, and `tsx`.
- Added text block sanitizer and certificate sanitizer under `src/lib/sanitize/`.
- `updateBlock` now reads the stored `block_type` and sanitizes `content.html` for text blocks before the update.
- Added `scripts/backfill-sanitize-html.ts` and `npm run backfill:sanitize-html` for existing rows.
- TDD commits:
  - `b01f8ac` failing tests
  - implementation commit, feat(phase-02): sanitize admin html on write
- Verification passed: `npm run verify`.

### 2026-05-08 - Phase 2 planning state repair

- GSD health check reported degraded with no auto-repairable issues.
- Existing untracked Phase 2 plans preserved:
  - `.planning/phases/02-content-safety-and-rate-limiting/02-1-sanitize-html-policy-PLAN.md`
  - `.planning/phases/02-content-safety-and-rate-limiting/02-2-embed-iframe-sandbox-PLAN.md`
- Missing plan added:
  - `.planning/phases/02-content-safety-and-rate-limiting/02-3-password-reset-rate-limit-PLAN.md`
- `ROADMAP.md` now lists all three Phase 2 plans and progress as 0/3 Planned.
- `REQUIREMENTS.md` traceability now marks HARDEN-01..04 Complete and HARDEN-05/HARDEN-06 Planned.
- Superseded: Phase 2 is verified. Next step is deployment prerequisites or Phase 3 planning.

### 2026-05-08 - Instruction cleanup

- Removed the active pause gate from `AGENTS.md` and `.planning/PROJECT.md`.
- Removed the matching Claude memory item and its index entry.
- Kept TDD as the default for meaningful behavior changes.

### 2026-05-08 — backlog Phase 999.1 complete

- Repo folder moved from `/Users/jarradhenry/Sites/Sandra University` to `/Users/jarradhenry/Sites/BMH Institute`.
- Claude memory directory moved from `~/.claude/projects/-Users-jarradhenry-Sites-Sandra-University` to `~/.claude/projects/-Users-jarradhenry-Sites-BMH-Institute`.
- `.env.local` old rename strings cleared without printing secrets.
- `.vercel/project.json` confirmed with `projectName: "bmh-institute"`.
- `npm run verify` passed from the new path: typecheck, 117 unit tests, 1 RTL test.

### 2026-05-04 — backlog Phase 999.1 (in-repo step)

- Commit `04deb69`: 9 files updated to swap Sandra University → BMH Institute (env example, e2e-prod assertion, planning codebase docs, AGENTS.md caveat). `npm run verify` green via husky.
- `.vercel/project.json` updated locally to `projectName: "bmh-institute"` (gitignored — local realignment with already-renamed Vercel upstream).
- Telegram channel: not yet configured. User to message @BotFather and run `/telegram:configure <token>` after reopening in the new path.
