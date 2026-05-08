# Roadmap: BMH Institute

## Milestone: v1 Production Hardening

This milestone closes the security and data-integrity gaps surfaced by the codebase audit before the BMH team scales up. No new user-facing features. Every change is provable by a test that did not exist before this milestone began.

## Phases

- [x] **Phase 1: Auth and Access Hardening** - Lock down route guards, invite expiry, user deletion, and quiz answer exposure
- [x] **Phase 01.1: Testing Coverage Parity** (INSERTED) - Add the RTL and Playwright e2e surfaces to match Sandra CRM, then automate the five Phase 01 HUMAN-UAT items
- [x] **Phase 2: Content Safety and Rate Limiting** - Sandbox embed iframes, sanitize admin-authored HTML, and throttle password-reset paths
- [ ] **Phase 3: Data Integrity** - Wrap role-group rewrites and module reordering in transactions, fix certificate-number races, and validate assignment file paths server-side
- [ ] **Phase 4: Type Safety and Test Coverage** - Generate Supabase types, then add Vitest unit coverage, integration tests for the trigger pipeline, and Playwright write-path e2e

## Phase Details

### Phase 1: Auth and Access Hardening
**Goal**: Every authenticated route enforces the correct access level, expired invites cannot grant access, deleted users cannot re-authenticate, and quiz correct-answer data is inaccessible to learner sessions
**Depends on**: Nothing (first phase)
**Requirements**: HARDEN-01, HARDEN-02, HARDEN-03, HARDEN-04
**Success Criteria** (what must be TRUE):
  1. A learner who navigates directly to any admin report URL receives a 403 or is redirected to /login rather than seeing any admin data
  2. An expired invite token that reaches the auth callback is rejected and the learner receives no role-group access
  3. A user whose record has been deleted via the admin UI cannot sign in with their original credentials
  4. A learner querying the Supabase anon API for answer_options receives no is_correct field in the response
**Plans**: 4 plans
- [x] 01-1-admin-route-guards-PLAN.md — HARDEN-01: page-level requireAdmin() on the four admin report pages with a regression unit per page
- [x] 01-2-invite-expiry-PLAN.md — HARDEN-02: callback expiry check, dedicated /login copy, and admin Resend control
- [x] 01-3-user-deletion-PLAN.md — HARDEN-03: deleteUser uses admin auth client (cascade FKs already in 001), with last-owner guard and the codebase's first integration test
- [x] 01-4-answer-options-view-PLAN.md — HARDEN-04: definer-mode view answer_options_public, REVOKE on the underlying table, scoring switches to service-role

### Phase 01.1: Testing Coverage Parity (INSERTED)

**Goal**: BMH Institute matches Sandra CRM's four-suite testing standard (Node unit, jsdom RTL, Postgres integration, Playwright e2e), and every HUMAN-UAT item left open by Phase 01 is replaced by a test that runs on demand without a human in the loop
**Depends on**: Phase 1
**Requirements**: TPAR-01, TPAR-02, TPAR-03, TPAR-04, TPAR-05
**Success Criteria** (what must be TRUE):
  1. `vitest.rtl.config.ts` and `vitest.rtl.setup.ts` exist, jsdom plus the `@testing-library/*` deps are installed, `npm run test:rtl` passes against at least one smoke RTL spec, and `npm run verify` includes the RTL suite
  2. `e2e/auth.setup.ts` and `e2e/fixtures.ts` exist, the fixtures refuse to run against the BMH Institute prod project ref, and a no-op spec under `e2e/` passes via `npm run test:e2e` once `TEST_SUPABASE_*` env vars are populated
  3. The existing `e2e-prod/` harness (auth.setup.ts, admin.spec.ts, dashboard.spec.ts) is extended with a learner-context spec automating the HARDEN-01 admin route guard, and `npm run test:prod` passes both the existing admin specs and the new learner spec against the live deployment with provided credentials
  4. The HARDEN-01 admin-route-guard HUMAN-UAT item is covered by an automated Playwright spec that runs without a human in the loop, and the HARDEN-04 cross-course answer-options HUMAN-UAT item is covered by `answer-options-isolation.integration.test.ts` running cleanly (no import-time throw on missing env vars)
  5. The HARDEN-02 expired-invite teardown and HARDEN-03 deleted-user re-auth HUMAN-UAT items are either (a) covered by automated specs that run cleanly with the documented env-var setup, or (b) explicitly logged in `01-HUMAN-UAT.md` as deferred-until-test-environment with a recorded reason. Destructive items must not silently remain manual.
**Plans**: 3 plans

Plans:
- [x] 01.1-1-rtl-test-infrastructure-PLAN.md (TPAR-01, TPAR-04) — vitest.rtl.config + setup, @testing-library/* deps, jsdom, test:rtl script, smoke RTL spec
- [x] 01.1-2-playwright-e2e-harness-PLAN.md (TPAR-02) — e2e/fixtures.ts with BMH prod-ref guard, auth.setup.ts, smoke spec, .env.example extension
- [x] 01.1-3-harden-uat-replacement-PLAN.md (TPAR-03, TPAR-05) — HARDEN-01 learner-context spec in e2e-prod/, integration-test gate fixes, env-var runbook, HUMAN-UAT updates

### Phase 2: Content Safety and Rate Limiting
**Goal**: Admin-authored HTML cannot execute scripts in learner browsers, embed iframes are sandboxed, and the forgot-password and password-reset paths cannot be abused by automated requests
**Depends on**: Phase 1
**Requirements**: HARDEN-05, HARDEN-06
**Success Criteria** (what must be TRUE):
  1. Saving a text block or certificate template containing a script tag strips the script before the record is written; the tag does not appear in the rendered lesson or certificate
  2. An embed block iframe renders with a sandbox attribute that prevents top-level navigation and unscoped script execution
  3. A second forgot-password or set-password request from the same IP or email within the configured window is rejected with an error before reaching Supabase auth
**Plans**: 3 plans
- [x] 02-1-sanitize-html-policy-PLAN.md - HARDEN-05: sanitize admin-authored text block HTML and certificate template bodies on write, with idempotent backfill tooling
- [x] 02-2-embed-iframe-sandbox-PLAN.md - HARDEN-05: sandbox embed-block iframes and enforce https iframe_src saves
- [x] 02-3-password-reset-rate-limit-PLAN.md - HARDEN-06: Postgres-backed per-IP and per-email rate limits for forgot-password and set-password

### Phase 3: Data Integrity
**Goal**: Role-group assignment and module reordering are atomic so a mid-operation failure cannot leave users with no access or modules with corrupt sort order, certificate numbers are collision-free under concurrent completions, and assignment file paths are validated server-side
**Depends on**: Phase 1
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04
**Success Criteria** (what must be TRUE):
  1. A simulated insert failure during role-group rewrite leaves the user's original role groups intact rather than deleted
  2. A simulated mid-sequence failure during module reordering leaves no module with a negative sort_order
  3. N concurrent course completions produce N distinct certificate numbers with no unique-constraint violation
  4. A server action call with a submission_file_path that does not begin with the authenticated user's ID is rejected before the row is inserted
**Plans**: TBD

### Phase 4: Type Safety and Test Coverage
**Goal**: The Supabase generated Database type replaces ad-hoc assertions across the codebase, and every critical write path has at minimum a Vitest unit test, an integration test for the trigger-driven certificate pipeline, and a Playwright e2e write-path test
**Depends on**: Phase 3
**Requirements**: TYPE-01, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Running npm run verify produces no TypeScript errors related to Supabase query results, and no as string or as number assertions remain on Supabase result fields in the report and lesson pages
  2. Vitest unit tests cover the auth callback flow, assignment submission action, admin review actions, and password-reset actions, and npm run test passes with all new tests green
  3. Integration tests exercise the trigger-driven completion and certificate pipeline against the live Supabase project and pass via npm run test:integration
  4. Playwright e2e tests exercise invite acceptance, quiz submission, assignment upload, admin approval and revision, and password reset as write paths against the prod-config harness and pass via npm run test:e2e
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth and Access Hardening | 4/4 | Complete (human_needed) | - |
| 01.1. Testing Coverage Parity | 3/3 | Complete | 2026-05-01 |
| 2. Content Safety and Rate Limiting | 3/3 | Complete | 2026-05-08 |
| 3. Data Integrity | 0/TBD | Not started | - |
| 4. Type Safety and Test Coverage | 0/TBD | Not started | - |

## Backlog

### Phase 999.1: Rename working directory to BMH Institute (COMPLETE — 2026-05-08)

**Goal:** Bring the local working directory in line with the new project identity by renaming `~/Sites/Sandra University/` to `~/Sites/BMH Institute/` (and the matching `~/.claude/projects/` memory path), then verifying nothing external is broken.
**Captured:** 2026-04-30 during /gsd-discuss-phase 1
**Why deferred:** Path mismatch is not blocking. Rename touches IDE workspace state, open terminals, shell aliases, the auto-memory dir, and any scripts pointing at the old path. Better as a deliberate housekeeping session than mid-phase.
**In-repo sweep:** Shipped 2026-05-04 as commit `04deb69` (9 files: env example, e2e-prod assertion, planning codebase docs, AGENTS.md caveat removed). Session handoff: `docs/handoff/2026-05-04-bmh-institute-rename.md`.
**Completed:** 2026-05-08. Repo folder and Claude memory directory moved to the BMH Institute path, `.env.local` old rename strings cleared, `.vercel/project.json` confirmed, and `npm run verify` passed from the new path.
**Steps:**
- [x] In-repo sweep of "Sandra University" / "sandra-university" string references (commit `04deb69`, 2026-05-04)
- [x] `.vercel/project.json` realigned locally to `projectName: "bmh-institute"` (gitignored)
- [x] Sweep `~/.zshrc`, `~/.zsh_aliases` — verified clean (no Sandra references)
- [x] `mv ~/Sites/"Sandra University" ~/Sites/"BMH Institute"`
- [x] `mv ~/.claude/projects/-Users-jarradhenry-Sites-Sandra-University ~/.claude/projects/-Users-jarradhenry-Sites-BMH-Institute`
- [x] `.env.local` old rename strings cleared (`SMTP_FROM_NAME` / `E2E_PROD_BASE_URL`)
- [x] Reopen any IDE workspace files / restored tabs from the new path

---
*Roadmap created: 2026-04-30*
*Milestone: v1 Production Hardening*
