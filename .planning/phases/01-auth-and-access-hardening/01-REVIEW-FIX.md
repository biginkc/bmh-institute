---
phase: 01-auth-and-access-hardening
fixed_at: 2026-04-30T20:47:00Z
review_path: .planning/phases/01-auth-and-access-hardening/01-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
pending_migrations:
  - supabase/migrations/009_answer_options_public_row_filter.sql
  - supabase/migrations/010_prevent_last_owner_deletion.sql
---

# Phase 01: Code Review Fix Report

Fixed at: 2026-04-30T20:47:00Z
Source review: .planning/phases/01-auth-and-access-hardening/01-REVIEW.md
Iteration: 1

Summary:
- Findings in scope: 7 (2 critical + 5 warnings)
- Fixed: 7
- Skipped: 0

`npm run verify` is GREEN. Typecheck clean. 117 unit tests pass across 24 test files.

Two new migrations were authored. Both are NOT yet applied to production. The orchestrator must apply them via mcp__supabase__apply_migration in this order:

1. `supabase/migrations/009_answer_options_public_row_filter.sql` (CR-01)
2. `supabase/migrations/010_prevent_last_owner_deletion.sql` (WR-04)

Migration 008 is already on production and is left intact, as instructed.

## Fixed Issues

### CR-01: HARDEN-04 view widens learner row access

Files modified:
- `supabase/migrations/009_answer_options_public_row_filter.sql` (new)
- `src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts`

Commit: `e818da3`

Applied fix: Authored migration 009 that redefines `public.answer_options_public` with `security_invoker = on`, recreates the `answer_options_learner_read` policy with the original `fn_user_has_course_access` predicate from migration 003, and re-grants SELECT on the underlying table to authenticated so the now-invoker view can resolve the policy. The pinned column list still hides `is_correct`. Service-role reads continue to bypass RLS for scoring. Admin reads continue via `answer_options_admin_all`.

The committed integration test was inverted from "isolation" (it asserted a learner could read options for any question). Flipped to assert zero rows for an out-of-scope question and added a service-role shape check that confirms exactly the four pinned columns and no `is_correct`.

Note: this is a logic-level migration that needs human verification on the live database. Marked `requires human verification` in spirit; integration tests will exercise the predicate after migration 009 is applied.

### CR-02: Expired invite still authenticates the user

Files modified:
- `src/app/auth/callback/route.ts`
- `src/app/auth/callback/route.test.ts`

Commit: `4cf97ee`

Applied fix: When `applyInvite` returns `{ ok: false, reason: "expired" }`, the GET handler now (a) calls `supabase.auth.signOut()` to clear the cookie session, and (b) calls `admin.auth.admin.deleteUser(session.user.id)` to remove the freshly created auth.users row. The FK cascade declared in migration 001 cleans up the default `profiles` row left by the `handle_new_user` trigger. If the service-role client is unavailable, the session is at least cleared and an orphan auth.users row is left for out-of-band cleanup.

Three new GET-handler tests cover the expired path (signOut + deleteUser called, redirect to `/login?error=invite_expired`), the active path (neither called, redirect proceeds), and the admin-throws fallback (signOut still called, redirect still issued).

### WR-01: Em dash in user-facing error message

Files modified:
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`

Commit: `473d4e9`

Applied fix: Replaced the em dash in the self-demotion toast with a period split. New text: `"You can't downgrade your own role. You'd lock yourself out."` No tests pinned the exact string; verified with grep before commit.

### WR-02: Em-dash placeholder character used throughout report tables

Files modified:
- `src/app/(dashboard)/admin/reports/page.tsx`
- `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx`
- `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx`
- `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx`

Commit: `e7cdbf2`

Applied fix: Replaced six visible `"—"` placeholders with `"-"` (hyphen-minus). Comment-level em dashes are out of scope; the AGENTS.md rule applies to user-facing copy.

### WR-03: Misleading "active learners" column on the Courses report

Files modified:
- `src/app/(dashboard)/admin/reports/page.tsx`
- `src/app/(dashboard)/admin/reports/summarize-by-course.test.ts` (new)

Commit: `cefcf7e`

Applied fix: Added a `lessons` query with an inner join on `modules` to fetch `course_id` per lesson. The page builds a `Map<lesson_id, course_id>` and passes it into `summarizeByCourse`, which now counts distinct `user_id`s per course instead of returning the org-wide distinct-user count. Lessons with no module mapping are ignored (so an unexpected join hole produces zero, not inflation).

`summarizeByCourse` is now exported (named) from `page.tsx` and covered by five unit tests: per-course distinct count, no double-count within a course, same learner across multiple courses, unmapped completion ignored, and `completedCount` sourced from course certs.

### WR-04: `deleteUser` last-owner check is non-transactional

Files modified:
- `supabase/migrations/010_prevent_last_owner_deletion.sql` (new)
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts`

Commit: `476501f`

Applied fix: Authored migration 010 that installs `fn_prevent_last_owner_deletion` as a `BEFORE DELETE` trigger on `public.profiles`. The trigger counts owners other than the row being deleted under the row lock taken by `delete` and raises `check_violation` when the delete would leave zero owners. The trigger fires on every delete path including cascades from `auth.users`, so the invariant is database-authoritative.

Updated `actions.ts` to keep the in-process guard for the friendly toast on the common single-actor path AND translate the trigger's `check_violation` (surfaced through the admin SDK as a generic message containing "last remaining owner") back into the same friendly toast when the action loses the race. Added a unit test that asserts the translation.

Note: Migration 010 must be applied to production before this race is closed. Until then, the in-process guard alone is the only protection (same situation as before this fix wave).

### WR-05: Admin users list page lacks page-level `requireAdmin()`

Files modified:
- `src/app/(dashboard)/admin/users/page.tsx`
- `src/app/(dashboard)/admin/users/page.test.ts` (new)

Commit: `0b78620`

Applied fix: Added `await requireAdmin()` as the first statement of `AdminUsersPage`, mirroring the four HARDEN-01 report pages. Added a regression test in the same shape as `reports/page.test.ts` covering: requireAdmin called before createClient, learner sessions redirected to `/dashboard`, unauthenticated requests redirected to `/login`.

## Skipped Issues

None. Every in-scope finding (CR-01, CR-02, WR-01..05) was fixed and committed atomically.

The four IN-* findings were out of scope per `fix_scope: critical_warning` and were not attempted.

## Pending Orchestrator Actions

1. Apply migration 009 to production:
   - `supabase/migrations/009_answer_options_public_row_filter.sql`
   - Re-run the `answer_options_isolation.integration.test.ts` suite afterwards to confirm the row filter is in effect.

2. Apply migration 010 to production:
   - `supabase/migrations/010_prevent_last_owner_deletion.sql`
   - Manual verification: in a staging copy, attempt to delete the only owner; confirm the error.

3. Commit this report (`01-REVIEW-FIX.md`).

---

_Fixed: 2026-04-30T20:47:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
