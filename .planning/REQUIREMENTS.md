# Requirements: BMH Institute

**Defined:** 2026-04-30
**Core Value:** A VA can sign in via an admin invite, work through assigned programs and courses on their own time, take quizzes and submit assignments without supervision, and receive a certificate when they finish. Admins can author content, manage learners, review submissions, and see who is making progress without leaving the platform.

This is the first GSD-managed milestone for a brownfield codebase. The Validated set in PROJECT.md captures the shipped surface; the Active set below is a production-hardening pass driven by gaps surfaced in `.planning/codebase/CONCERNS.md`. No new user-facing features in v1.

## v1 Requirements

### Security Hardening

- [x] **HARDEN-01**: Every admin route page calls `requireAdmin()` at the top of its function so direct navigation cannot reach admin data through a learner session, with regression coverage that asserts a learner-session fetch returns 403 or redirects to /login
- [x] **HARDEN-02**: The auth callback rejects expired invites by comparing `invites.expires_at > now()` before applying `system_role` and `role_group_ids`, with a unit test covering an expired invite and an active invite
- [x] **HARDEN-03**: `deleteUser` removes the `auth.users` record via the admin client in addition to suspending the profile, with a test that asserts a deleted user cannot re-authenticate
- [x] **HARDEN-04**: Quiz `is_correct` is hidden from learner-session reads via a Postgres view that excludes the column, with RLS that revokes direct table read for non-admin sessions and a test that asserts a learner anon-key query returns no `is_correct` field
- [ ] **HARDEN-05**: Embed-block iframes load with a sandbox attribute, and admin-authored HTML in text blocks and certificate templates is sanitized via `sanitize-html` on write, with tests that assert `<script>` tags are stripped on save and not executed on render
- [ ] **HARDEN-06**: Forgot-password and password-reset paths enforce server-side rate limiting (request-count threshold per IP plus per-email window), with a test that asserts the second submission within the threshold is rejected

### Data Integrity

- [ ] **INTEG-01**: `setUserRoleGroups` and `saveUserSettings` rewrite `user_role_groups` inside a Postgres function with transactional semantics (delete + insert atomic), with an integration test that simulates an insert failure and asserts the original rows are preserved
- [ ] **INTEG-02**: Module reordering runs in a single Postgres function (CASE-expression update or explicit transaction) so a partial failure cannot leave a module with a negative `sort_order`, with an integration test that asserts ordering is consistent under simulated mid-sequence failure
- [ ] **INTEG-03**: `fn_next_certificate_number` uses a Postgres sequence (or `SELECT ... FOR UPDATE`) so concurrent completions cannot collide on the unique constraint, with an integration test that fires N concurrent completions and asserts N distinct certificate numbers were issued
- [ ] **INTEG-04**: Assignment submission `submission_file_path` is server-validated against `${user.id}/` prefix before insert, with a unit test that rejects a path pointing at another user's prefix

### Type Safety

- [ ] **TYPE-01**: Supabase types are generated via `supabase gen types` and the generated `Database` type is wired into the Supabase client, with all `as string` / `as number` / `as boolean` assertions on Supabase results removed across the report and lesson pages

### Test Coverage

- [ ] **TEST-01**: Vitest unit coverage added for the auth callback flow (`src/app/auth/callback/route.ts`), assignment submission (`src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts`), admin review actions (`src/app/(dashboard)/admin/submissions/actions.ts`), forgot-password and set-password actions
- [ ] **TEST-02**: Integration tests cover the trigger-driven completion and certificate pipeline against a real Supabase project, including `fn_issue_course_certificate_if_eligible` and `fn_issue_program_certificate_if_eligible`
- [ ] **TEST-03**: Playwright write-path coverage exercises invite acceptance, quiz submission, assignment upload, admin approval and revision, and password reset against the prod-config harness

### Testing Parity (Phase 01.1)

- [x] **TPAR-01**: BMH Institute ships a jsdom RTL suite at parity with Sandra CRM — `vitest.rtl.config.ts`, `vitest.rtl.setup.ts` (jest-dom matchers, in-memory localStorage shim, afterEach cleanup), `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` installed, `npm run test:rtl` exits 0 against at least one smoke RTL spec
- [x] **TPAR-02**: Playwright e2e harness is fully wired — `e2e/auth.setup.ts` writes storage state to `e2e/.auth/user.json`, `e2e/fixtures.ts` exposes a service-role admin client and refuses to run against the BMH Institute prod project ref (`dhvfsyteqsxagokoerrx`), and `npm run test:e2e` exits 0 against at least one no-op spec when `TEST_SUPABASE_*` env vars are populated
- [x] **TPAR-03**: Production smoke harness covers the HARDEN-01 admin route guard from a learner viewpoint — the existing admin-context `e2e-prod/` setup is extended with a learner-context spec (separate storage state or in-spec fresh sign-in), and `npm run test:prod` runs both contexts against the live deployment with documented credentials
- [x] **TPAR-04**: `npm run verify` includes the RTL suite (`npm run typecheck && npm run test && npm run test:rtl`); the husky pre-commit hook continues to run `npm run verify` and fails on RTL regressions
- [x] **TPAR-05**: Each of the five Phase 01 HUMAN-UAT items is replaced — read-only items (HARDEN-01 admin route guards, HARDEN-04 cross-course answer options) by automated specs; integration items (HARDEN-03 deleted-user re-auth, HARDEN-04 isolation contract) by un-skipping and de-throwing the existing integration tests; destructive items (HARDEN-02 expired invite teardown, HARDEN-03 deleted user re-auth) by either an automated path or an explicit deferral note in `01-HUMAN-UAT.md` with a recorded reason

## v2 Requirements

Deferred to a future milestone. Tracked but not in the current roadmap.

### Role-Play Embed Scaffolding

- **EMBD-01**: Migration 008 adds the `role_play` block type and `role_play_results` table per `role-play-embed-contract.md`
- **EMBD-02**: `src/lib/role-plays/embed-token.ts` mints and verifies the short-lived HS256 JWT shared with Sandra Practice
- **EMBD-03**: `RolePlayBlock` client component renders the iframe and listens for `rp.ready`, `rp.height`, `rp.complete`, `rp.error` postMessage events with origin verification
- **EMBD-04**: Admin block editor adds a "Role play" option that fetches available scenarios from Sandra Practice
- **EMBD-05**: `saveRolePlayResult` server action persists scores, surfaced in user and program admin reports

### Performance

- **PERF-01**: Admin reports overview paginates the learner table and pushes aggregation into Postgres views or RPCs
- **PERF-02**: User report page filters the modules query to the user's accessible course IDs (or replaces with `fn_course_completion_percent` RPC)
- **PERF-03**: Signed URLs cached via `unstable_cache` keyed on `(lessonId, file_path)` with revalidation shorter than the 1-hour TTL

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI voice role-play runtime | Owned by the standalone Sandra Practice app; embed surface lives in BMH Institute v2 |
| Test Supabase project | `npm run test:integration` and `npm run test:e2e` continue against prod read-only as a deliberate cost choice |
| New content authoring features | Hardening milestone, no scope creep |
| Mobile native app | Web-first, never in scope |
| Auto translation | English-first |
| Real-time team competitions | Not core to the learning outcome |
| Comment threads on transcripts | Reviewers can use share URLs; defer to Sandra Practice v2+ |
| Lip-synced animated avatars | Static photo plus speaking glow matches the Yoodli reference; HeyGen latency is undesirable |

## Traceability

Mapping of requirements to phases. Updated by the gsd-roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARDEN-01 | Phase 1 | Complete |
| HARDEN-02 | Phase 1 | Complete |
| HARDEN-03 | Phase 1 | Complete |
| HARDEN-04 | Phase 1 | Complete |
| HARDEN-05 | Phase 2 | Planned |
| HARDEN-06 | Phase 2 | Planned |
| INTEG-01 | Phase 3 | Pending |
| INTEG-02 | Phase 3 | Pending |
| INTEG-03 | Phase 3 | Pending |
| INTEG-04 | Phase 3 | Pending |
| TYPE-01 | Phase 4 | Pending |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| TPAR-01 | Phase 01.1 | Complete |
| TPAR-02 | Phase 01.1 | Complete |
| TPAR-03 | Phase 01.1 | Complete |
| TPAR-04 | Phase 01.1 | Complete |
| TPAR-05 | Phase 01.1 | Complete |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-30*
*Last updated: 2026-05-08 - Phase 2 plan traceability repaired after folder rename*
