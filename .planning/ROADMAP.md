# Roadmap: BMH Institute

## Milestone: v1 Production Hardening

This milestone closes the security and data-integrity gaps surfaced by the codebase audit before the BMH team scales up. No new user-facing features. Every change is provable by a test that did not exist before this milestone began.

## Phases

- [ ] **Phase 1: Auth and Access Hardening** - Lock down route guards, invite expiry, user deletion, and quiz answer exposure
- [ ] **Phase 2: Content Safety and Rate Limiting** - Sandbox embed iframes, sanitize admin-authored HTML, and throttle password-reset paths
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
- [ ] 01-1-admin-route-guards-PLAN.md — HARDEN-01: page-level requireAdmin() on the four admin report pages with a regression unit per page
- [ ] 01-2-invite-expiry-PLAN.md — HARDEN-02: callback expiry check, dedicated /login copy, and admin Resend control
- [ ] 01-3-user-deletion-PLAN.md — HARDEN-03: deleteUser uses admin auth client (cascade FKs already in 001), with last-owner guard and the codebase's first integration test
- [ ] 01-4-answer-options-view-PLAN.md — HARDEN-04: definer-mode view answer_options_public, REVOKE on the underlying table, scoring switches to service-role

### Phase 2: Content Safety and Rate Limiting
**Goal**: Admin-authored HTML cannot execute scripts in learner browsers, embed iframes are sandboxed, and the forgot-password and password-reset paths cannot be abused by automated requests
**Depends on**: Phase 1
**Requirements**: HARDEN-05, HARDEN-06
**Success Criteria** (what must be TRUE):
  1. Saving a text block or certificate template containing a script tag strips the script before the record is written; the tag does not appear in the rendered lesson or certificate
  2. An embed block iframe renders with a sandbox attribute that prevents top-level navigation and unscoped script execution
  3. A second forgot-password or set-password request from the same IP or email within the configured window is rejected with an error before reaching Supabase auth
**Plans**: TBD

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
| 1. Auth and Access Hardening | 0/4 | Planned | - |
| 2. Content Safety and Rate Limiting | 0/TBD | Not started | - |
| 3. Data Integrity | 0/TBD | Not started | - |
| 4. Type Safety and Test Coverage | 0/TBD | Not started | - |

## Backlog

### Phase 999.1: Rename working directory to BMH Institute (BACKLOG)

**Goal:** Bring the local working directory in line with the new project identity by renaming `~/Sites/Sandra University/` to `~/Sites/BMH Institute/` (and the matching `~/.claude/projects/` memory path), then verifying nothing external is broken.
**Captured:** 2026-04-30 during /gsd-discuss-phase 1
**Why deferred:** Path mismatch is not blocking. Rename touches IDE workspace state, open terminals, shell aliases, the auto-memory dir, and any scripts pointing at the old path. Better as a deliberate housekeeping session than mid-phase.
**Steps:**
- [ ] `mv ~/Sites/"Sandra University" ~/Sites/"BMH Institute"`
- [ ] `mv ~/.claude/projects/-Users-jarradhenry-Sites-Sandra-University ~/.claude/projects/-Users-jarradhenry-Sites-BMH-Institute`
- [ ] Verify `.vercel/project.json` still resolves the linked Vercel project
- [ ] Sweep `~/.zshrc`, `~/.zsh_aliases`, scripts under `~/Sites/` for hardcoded "Sandra University"
- [ ] Reopen any IDE workspace files / restored tabs from the new path

---
*Roadmap created: 2026-04-30*
*Milestone: v1 Production Hardening*
