---
phase: 01-auth-and-access-hardening
verified: 2026-04-30T21:10:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Sign in as a learner and navigate directly to /admin/reports, /admin/reports/users/[any-id], /admin/reports/courses/[any-id], /admin/reports/programs/[any-id]. Confirm you are redirected to /dashboard (not shown admin data)."
    expected: "Browser lands on /dashboard with no admin data visible."
    why_human: "requireAdmin() throws a NEXT_REDIRECT error; the redirect destination and that no data leaks can only be confirmed with a real browser session."
  - test: "Visit /login?error=invite_expired and read the error message."
    expected: "Message reads exactly: This invite link has expired. Ask your admin to send you a fresh one."
    why_human: "String rendering and URL-param parsing require a browser."
  - test: "Attempt to sign in with the credentials of a user who was deleted via the admin UI."
    expected: "Sign-in fails with an auth error; the user cannot access /dashboard."
    why_human: "Re-authentication rejection requires a live Supabase Auth round-trip."
  - test: "Using the Supabase dashboard or a PostgREST client with an authenticated (non-service-role) JWT, sign in as a learner with no role-group access to course X, then SELECT * FROM answer_options_public WHERE question_id IN (questions of course X)."
    expected: "Zero rows returned. The view (security_invoker = on) consults the recreated answer_options_learner_read policy which filters by fn_user_has_course_access."
    why_human: "The integration test (answer-options-isolation.integration.test.ts) cannot execute because TEST_SUPABASE_* keys are absent from .env.test.local. Schema-level verification was completed live (see Live Migration Verification table below); cross-course row isolation is a learner-session contract that is best confirmed with a real authenticated Supabase JWT."
  - test: "Populate TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test.local and run npm run test:integration."
    expected: "actions.integration.test.ts and answer-options-isolation.integration.test.ts both execute and pass. The describe.skip on the HARDEN-03 integration test should be removed at the same time."
    why_human: "Pulling secrets and editing .env.test.local is a manual operation outside the GSD execution scope. This closes the residual integration coverage gap for HARDEN-03 and HARDEN-04."
---

# Phase 1: Auth and Access Hardening Verification Report

## 2026-05-09 Superseding Note

The original verification report below was created before the later seeded E2E and production-readiness work existed. Its manual caveats are now superseded by follow-up automation and production evidence:

- Phase 01.1 replaced the original HUMAN-UAT items with automated or explicit test-environment paths.
- Phase 4 follow-ups added durable seeded E2E for LMS write paths and invite acceptance.
- PR #45 added real production email-link readiness for invite and password reset.
- GitHub Actions production-readiness run `25598402881` passed from `main` with 4 checks on 2026-05-09.

Current status: PASS.

**Phase Goal:** Every authenticated route enforces the correct access level, expired invites cannot grant access, deleted users cannot re-authenticate, and quiz correct-answer data is inaccessible to learner sessions
**Verified:** 2026-04-30T21:10:00Z
**Status:** passed after superseding follow-up verification
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A learner who navigates directly to any admin report URL receives a 403 or is redirected to /login rather than seeing any admin data | VERIFIED | `await requireAdmin()` is the first statement in all four report pages (grep confirms 1 match each). 12 regression unit tests pass (3 per page: call-order, unauthed redirect, learner redirect). `npm run verify` exits 0 with 117 tests green. |
| 2 | Submitting an expired invite token to the auth callback returns an error and the user remains unauthenticated | VERIFIED (with caveat) | `applyInvite` checks `new Date(invite.expires_at) <= new Date()` before any role write and returns `{ ok: false, reason: "expired" }`. GET handler then calls `supabase.auth.signOut()` and `admin.auth.admin.deleteUser(userId)` before redirecting to `/login?error=invite_expired`. CR-02 fix is committed at `4cf97ee`. Login page renders the `invite_expired` branch. 4 unit tests pass for `applyInvite`; 3 GET-handler tests cover the expired path. Caveat: cannot confirm the full teardown round-trip without a human browser test. |
| 3 | A user whose record has been deleted via the admin UI cannot sign in with their original credentials | VERIFIED (with caveat) | `deleteUser` calls `admin.auth.admin.deleteUser(userId)` via service-role client, removing the `auth.users` row. Last-owner guard in place. All 6 unit tests pass (includes guard branches and auth delete path). Cascade FKs in migration 001 are unchanged. Integration tests exist in `actions.integration.test.ts` but are marked `describe.skip` - they confirm the re-auth contract only when run manually with `TEST_SUPABASE_*` env vars. |
| 4 | A learner querying the Supabase anon API for answer_options receives no is_correct field in the response | VERIFIED (with caveat) | Migration 008 creates `answer_options_public` view pinned to 4 columns (no `is_correct`), drops `answer_options_learner_read`, GRANTs view to `authenticated`, REVOKEs table from `authenticated`. Migration 009 (CR-01 fix) switches the view to `security_invoker = on` and recreates `answer_options_learner_read` with the original `fn_user_has_course_access` row filter. Live SQL evidence in 01-4-SUMMARY.md confirms migration 008 state; migration 009 + 010 are documented as NOT yet applied to production. The committed integration test `answer-options-isolation.integration.test.ts` cannot run without `TEST_SUPABASE_*` env vars. |

**Score:** 4/4 truths verified (all with integration/live-verification caveats)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/(dashboard)/admin/reports/page.tsx` | requireAdmin guard | VERIFIED | `await requireAdmin()` at line 24, before createClient |
| `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` | requireAdmin guard | VERIFIED | `await requireAdmin()` at line 29, before params and createClient |
| `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx` | requireAdmin guard | VERIFIED | `await requireAdmin()` at line 29, before params and createClient |
| `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx` | requireAdmin guard | VERIFIED | `await requireAdmin()` at line 29, before params and createClient |
| `src/app/(dashboard)/admin/reports/page.test.ts` | 3 regression tests | VERIFIED | File exists; 3 tests pass |
| `src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts` | 3 regression tests | VERIFIED | File exists; 3 tests pass |
| `src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts` | 3 regression tests | VERIFIED | File exists; 3 tests pass |
| `src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts` | 3 regression tests | VERIFIED | File exists; 3 tests pass |
| `src/app/auth/callback/route.ts` | applyInvite with expiry check + CR-02 teardown | VERIFIED | Exports `applyInvite`; `expires_at` check at line 101; GET handler calls `signOut()` and `deleteUser()` on expired path |
| `src/app/auth/callback/route.test.ts` | 4 applyInvite unit tests + 3 GET handler tests | VERIFIED | File exists and all tests pass |
| `src/app/(auth)/login/page.tsx` | invite_expired branch | VERIFIED | `urlError === "invite_expired"` at line 53 |
| `src/app/(dashboard)/admin/users/page.tsx` | isExpired flag + ResendInviteButton | VERIFIED | `isExpired` appears 2 times; ResendInviteButton rendered |
| `src/app/(dashboard)/admin/users/actions.ts` | resendInvite server action | VERIFIED | `export async function resendInvite` confirmed |
| `src/app/(dashboard)/admin/users/actions.test.ts` | 6 resendInvite tests | VERIFIED | File exists; 6 tests pass |
| `src/app/(dashboard)/admin/users/resend-invite-button.tsx` | ResendInviteButton client component | VERIFIED | File exists |
| `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` | deleteUser via admin auth client | VERIFIED | `auth.admin.deleteUser` called at line 206; last-owner guard in place |
| `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts` | 6 deleteUser unit tests + 1 trigger-translation test | VERIFIED | File exists; 7 tests pass |
| `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts` | 2 integration tests | VERIFIED (skipped) | File exists with real assertions; marked `describe.skip` - cannot run without TEST_SUPABASE_* env vars |
| `src/app/(dashboard)/lessons/[lessonId]/page.tsx` | reads answer_options_public | VERIFIED | `.from("answer_options_public")` at line 240 |
| `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` | scoring fetch uses createAdminClient | VERIFIED | `createAdminClient()` acquired before questions fetch; `answer_options (id, is_correct)` selected via admin client only |
| `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts` | 3 unit tests for HARDEN-04 | VERIFIED | File exists; 3 tests pass |
| `src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts` | 3 integration tests for RLS boundary | VERIFIED (cannot execute) | File exists; cannot run without TEST_SUPABASE_* env vars |
| `supabase/migrations/008_answer_options_public_view.sql` | definer-mode view + REVOKE | VERIFIED (applied to prod) | Recorded as version 20260501012728. Subsequently superseded for the view definition by migration 009. |
| `supabase/migrations/009_answer_options_public_row_filter.sql` | invoker-mode view + row filter | VERIFIED (applied to prod) | Applied 2026-04-30 via Supabase MCP. Recorded as version 20260501020518. Live SQL: view security_invoker = on; both answer_options_admin_all and answer_options_learner_read policies present. |
| `supabase/migrations/010_prevent_last_owner_deletion.sql` | DB-level last-owner trigger | VERIFIED (applied to prod) | Applied 2026-04-30 via Supabase MCP. Recorded as version 20260501020537. Live SQL: trigger trg_prevent_last_owner_deletion fires BEFORE DELETE on profiles; backing function is SECURITY DEFINER. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `admin/reports/page.tsx` | `@/lib/auth/guard` | `import { requireAdmin }` | WIRED | Import confirmed; called as first statement |
| `admin/reports/users/[userId]/page.tsx` | `@/lib/auth/guard` | `import { requireAdmin }` | WIRED | Import confirmed; called before params |
| `admin/reports/courses/[courseId]/page.tsx` | `@/lib/auth/guard` | `import { requireAdmin }` | WIRED | Import confirmed; called before params |
| `admin/reports/programs/[programId]/page.tsx` | `@/lib/auth/guard` | `import { requireAdmin }` | WIRED | Import confirmed; called before params |
| `auth/callback/route.ts` | `login/page.tsx` | `?error=invite_expired` redirect | WIRED | GET handler redirects with that param; login page branches on it |
| `admin/users/resend-invite-button.tsx` | `admin/users/actions.ts` | `import { resendInvite }` | WIRED | File imports and calls resendInvite |
| `admin/users/actions.ts` | `@/lib/supabase/admin` | `createAdminClient().auth.admin.inviteUserByEmail` | WIRED | Pattern confirmed in resendInvite body |
| `admin/users/[userId]/edit/actions.ts` | `@/lib/supabase/admin` | `createAdminClient().auth.admin.deleteUser(userId)` | WIRED | Confirmed at line 206 |
| `lessons/[lessonId]/page.tsx` | `answer_options_public` | `supabase.from("answer_options_public")` | WIRED | Confirmed at line 240 |
| `lessons/[lessonId]/quiz-actions.ts` | `@/lib/supabase/admin` | `createAdminClient` for scoring fetch | WIRED | Admin client acquired before questions select |
| `migration 008` | `public.answer_options` | REVOKE + view GRANT | WIRED (applied) | Applied to production, verified live |
| `migration 009` | `public.answer_options` | security_invoker=on + row filter | WIRED (applied) | Applied to production 2026-04-30, verified live |
| `migration 010` | `public.profiles` | BEFORE DELETE trigger | WIRED (applied) | Applied to production 2026-04-30, verified live |

### Live Migration Verification (post-apply, 2026-04-30)

| Property | Source | Expected | Actual |
|----------|--------|----------|--------|
| Migrations 008, 009, 010 recorded | `supabase_migrations.schema_migrations` | All three present | versions 20260501012728, 20260501020518, 20260501020537 |
| `answer_options_public` is invoker-mode | `pg_options_to_table(reloptions)` on `pg_class` | `security_invoker = on` | `on` |
| `answer_options_public` columns | `information_schema.columns` | id, question_id, option_text, sort_order (no is_correct) | id, question_id, option_text, sort_order |
| Policies on `answer_options` | `pg_policies` | `answer_options_admin_all` + `answer_options_learner_read` (both present, both with course-access predicate where applicable) | both present |
| `trg_prevent_last_owner_deletion` exists | `pg_trigger` join `pg_class`/`pg_namespace` for `public.profiles` | trigger present, BEFORE DELETE, function `fn_prevent_last_owner_deletion`, SECURITY DEFINER | present, function confirmed, prosecdef = true |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `admin/reports/page.tsx` | supabase queries | Supabase RLS-scoped client | Yes (requireAdmin gates first) | FLOWING |
| `auth/callback/route.ts` | `invite.expires_at` | `admin.from("invites").select(...)` real DB read | Yes | FLOWING |
| `login/page.tsx` | `urlError` | `useSearchParams()` from URL | Yes (URL param set by callback redirect) | FLOWING |
| `admin/users/page.tsx` | `isExpired` | `new Date(i.expires_at)` compared to `new Date()` | Yes (real invite row from DB) | FLOWING |
| `admin/users/[userId]/edit/actions.ts` | `deleteUser` | `admin.auth.admin.deleteUser(userId)` | Yes (service-role delete) | FLOWING |
| `lessons/[lessonId]/page.tsx` | answer options | `supabase.from("answer_options_public")` | Yes (real view, no is_correct) | FLOWING |
| `lessons/[lessonId]/quiz-actions.ts` | `rawQuestions` with `is_correct` | `admin.from("questions").select(...)` | Yes (service-role, bypasses RLS) | FLOWING |

### Behavioral Spot-Checks

Step 7b skipped for migration-dependent behaviors: the REVOKE and view boundary cannot be verified without a live authenticated Supabase session. Unit tests confirm the application-layer behavior; integration tests require TEST_SUPABASE_* env vars that are not populated.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All unit tests pass | `npm run verify` | 117 tests passed, 24 test files, 0 typecheck errors | PASS |
| requireAdmin in all 4 report pages | `grep -c "await requireAdmin()"` per page | 1 match each | PASS |
| invite_expired in callback and login | `grep -c "invite_expired"` | 1 in route.ts, 1 in login/page.tsx | PASS |
| auth.admin.deleteUser wired | `grep -c "auth.admin.deleteUser" actions.ts` | 1 match | PASS |
| answer_options_public in learner page | `grep "answer_options_public" page.tsx` | 2 matches (comment + query) | PASS |
| migration 009 file content | File read | security_invoker=on + fn_user_has_course_access predicate | PASS |
| migration 010 file content | File read | fn_prevent_last_owner_deletion trigger correct | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HARDEN-01 | 01-1-admin-route-guards-PLAN.md | Every admin route page calls requireAdmin() at the top; regression coverage asserts learner-session fetch redirects | SATISFIED | 4 pages guarded; 12 unit tests; npm run verify green |
| HARDEN-02 | 01-2-invite-expiry-PLAN.md | Auth callback rejects expired invites before applying system_role and role_group_ids; unit test covers expired and active | SATISFIED | applyInvite checks expires_at; 4 unit tests cover active/expired/accepted/missing; CR-02 teardown added |
| HARDEN-03 | 01-3-user-deletion-PLAN.md | deleteUser removes auth.users record; test asserts deleted user cannot re-authenticate | SATISFIED (integration test pending manual run) | deleteUser calls admin.auth.admin.deleteUser; 6 unit tests pass; integration tests exist but are describe.skip pending TEST_SUPABASE_* env vars |
| HARDEN-04 | 01-4-answer-options-view-PLAN.md | Quiz is_correct hidden from learner-session reads; RLS revokes direct table read; test asserts learner anon-key query returns no is_correct | SATISFIED (live boundary pending migration 009 apply + manual verification) | Migrations 008+009 implement the boundary; learner page reads the view; scoring uses service-role; integration test exists but cannot run |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `admin/users/[userId]/edit/actions.integration.test.ts` | 44 | `describe.skip` | Warning | The HARDEN-03 "deleted user cannot re-authenticate" integration assertion is skipped; the contract is asserted only by a unit test with mocked Supabase |
| `lessons/[lessonId]/answer-options-isolation.integration.test.ts` | (module level) | Throws if env vars absent | Warning | The HARDEN-04 RLS boundary test errors at import when TEST_SUPABASE_* keys are missing; it is never run as a CI gate |

### Human Verification Required

#### 1. End-to-End Admin Route Guard (HARDEN-01)

**Test:** Log in as a learner (non-admin, non-owner system_role). Navigate directly to `/admin/reports`. Attempt to navigate to `/admin/reports/users/[any-uuid]`.
**Expected:** Both navigations redirect to `/dashboard` with no admin data visible.
**Why human:** requireAdmin() throws NEXT_REDIRECT which Next.js catches; the redirect target and absence of data leaks require a real browser session.

#### 2. Expired Invite Full Teardown (HARDEN-02 + CR-02)

**Test:** Use the admin Resend control to generate a fresh invite. Manually expire it in the database (`UPDATE invites SET expires_at = now() - interval '1 second' WHERE id = '...'`). Click the invite link. Check whether: (a) you land on `/login?error=invite_expired`, (b) you cannot navigate to `/dashboard`, (c) the auth.users row no longer exists.
**Expected:** (a) correct; (b) you are redirected to login on any attempt to access /dashboard; (c) row is gone.
**Why human:** The signOut + deleteUser sequence requires a real OAuth code flow and live Supabase Auth round-trip.

#### 3. Deleted User Re-Authentication (HARDEN-03)

**Test:** Delete a test user via the admin UI. Attempt to sign in with that user's credentials.
**Expected:** Sign-in fails with an authentication error; `/dashboard` is not reachable.
**Why human:** Re-authentication rejection requires a live Supabase Auth call. The integration test (`actions.integration.test.ts`) is marked `describe.skip` pending `TEST_SUPABASE_*` env vars.

#### 4. Learner Cannot Read Cross-Course Answer Options (HARDEN-04)

**Test:** Sign in as a learner with no role-group access to course X. Using the Supabase JS client or PostgREST with that learner's JWT, run `SELECT * FROM answer_options_public WHERE question_id IN (any question of course X) LIMIT 1`.
**Expected:** Zero rows. The view (security_invoker = on) consults `answer_options_learner_read`, which filters by `fn_user_has_course_access(auth.uid(), modules.course_id)`. Schema-level invariants (column list, REVOKE on underlying table, view in invoker mode, both policies present) are already verified live. The remaining unknown is the cross-course row-isolation contract under a real learner JWT.
**Why human:** The integration test covering this (`answer-options-isolation.integration.test.ts`) cannot execute because `TEST_SUPABASE_*` env vars are absent from `.env.test.local`. Requires a real authenticated Supabase session.

#### 5. Populate TEST_SUPABASE_* env vars and run integration suite

**Test:** Add `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` to `.env.test.local`. Remove the `describe.skip` from `actions.integration.test.ts`. Run `npm run test:integration`.
**Expected:** Both `actions.integration.test.ts` and `answer-options-isolation.integration.test.ts` execute and pass.
**Why human:** Pulling secrets and editing `.env.test.local` is a manual operation outside GSD execution scope.

### Gaps Summary

No blocking code gaps and no live-database gaps were found. The four success criteria are implemented in the codebase, the unit test suite passes cleanly (117/117), and migrations 008, 009, 010 are all applied and verified live in production. The `human_needed` status is driven by two residual items that require human action before this phase can be declared fully closed:

1. **Integration tests cannot execute without TEST_SUPABASE_* env vars.** The `describe.skip` in `actions.integration.test.ts` and the env-var throw in `answer-options-isolation.integration.test.ts` mean the "deleted user cannot re-authenticate" (HARDEN-03 AC) and the cross-course row-isolation contract (HARDEN-04 AC) are pinned only by unit tests with mocked Supabase plus the live SQL evidence captured during plan execution and verification. Once `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, and `TEST_SUPABASE_SERVICE_ROLE_KEY` are added to `.env.test.local` and the `describe.skip` is removed from the HARDEN-03 integration test, both gaps close automatically.

2. **End-to-end browser verification has not been performed** for the four success criteria as stated in the ROADMAP. The redirect behavior, expired-invite teardown, deleted-user re-auth rejection, and cross-course answer-options isolation each benefit from at minimum one smoke-test pass on the deployed application by a real browser session with a learner JWT.

---

_Verified: 2026-04-30T21:10:00Z_
_Verifier: Claude (gsd-verifier)_
