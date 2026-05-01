---
phase: 01-auth-and-access-hardening
reviewed: 2026-04-30T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/app/(auth)/login/page.tsx
  - src/app/(dashboard)/admin/reports/courses/[courseId]/page.test.ts
  - src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx
  - src/app/(dashboard)/admin/reports/page.test.ts
  - src/app/(dashboard)/admin/reports/page.tsx
  - src/app/(dashboard)/admin/reports/programs/[programId]/page.test.ts
  - src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx
  - src/app/(dashboard)/admin/reports/users/[userId]/page.test.ts
  - src/app/(dashboard)/admin/reports/users/[userId]/page.tsx
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts
  - src/app/(dashboard)/admin/users/[userId]/edit/actions.ts
  - src/app/(dashboard)/admin/users/[userId]/edit/user-edit-form.tsx
  - src/app/(dashboard)/admin/users/actions.test.ts
  - src/app/(dashboard)/admin/users/actions.ts
  - src/app/(dashboard)/admin/users/page.tsx
  - src/app/(dashboard)/admin/users/resend-invite-button.tsx
  - src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts
  - src/app/(dashboard)/lessons/[lessonId]/page.tsx
  - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts
  - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
  - src/app/auth/callback/route.test.ts
  - src/app/auth/callback/route.ts
  - supabase/migrations/008_answer_options_public_view.sql
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 01 Code Review: Auth and Access Hardening

Reviewed: 2026-04-30
Depth: standard
Files Reviewed: 24
Status: issues_found

## Summary

Phase 01 closes four hardening tickets (HARDEN-01 through HARDEN-04). The execution is generally sound with TDD discipline visible across every plan, redundant page-level guards on report routes, and correct cascade reasoning on user deletion. Two findings warrant blocking attention before this code stays in production:

1. The HARDEN-04 view (`answer_options_public`) is BROADER than the policy it replaced. The old `answer_options_learner_read` policy restricted reads to courses the learner had access to. The new definer-mode view is granted to `authenticated` with no row filter, so any signed-in learner can SELECT every answer option in the database, including options for quizzes attached to courses they have no role-group access to. Hiding `is_correct` was achieved; row-level authorization was discarded.

2. The HARDEN-02 expired-invite path leaves the user authenticated. `applyInvite` runs AFTER `exchangeCodeForSession`, so by the time the route handler decides to redirect to `/login?error=invite_expired`, the user already has a session and the auth.users row exists (created by Supabase during invite acceptance). They can navigate to `/dashboard` and use the platform with the default learner profile. The expiry check blocks role escalation but does not block authentication.

The remaining items are quality and consistency observations: an em-dash violation in user-facing copy, a misleading aggregate column in the reports overview, several `"—"` placeholder characters in user-facing tables, a non-transactional last-owner check in `deleteUser`, and a consistency gap where the admin users list does not have its own `requireAdmin()` defense-in-depth (the layout-only guard is the same gap HARDEN-01 closed for reports).

## Critical Issues

### CR-01: HARDEN-04 view widens learner row access from "courses I have access to" to "all answer options globally"

BLOCKER. Authorization regression introduced by the same migration that hides `is_correct`.

File: `supabase/migrations/008_answer_options_public_view.sql:7-15`

The migration:
1. Creates `public.answer_options_public` with `security_invoker = off` (definer mode) and no WHERE clause.
2. Drops `answer_options_learner_read` from the underlying table.
3. Grants SELECT on the view to `authenticated`, revokes SELECT on the underlying table from `authenticated`.

In definer mode the view runs as the owner (typically a superuser-equivalent role for migrations applied via the Supabase MCP), so RLS on the underlying table is not consulted. The view itself has no `where` clause and no auth-aware filter. Result: any authenticated learner can `select * from answer_options_public` and receive every row.

The previous policy (`003_rls_policies.sql:165-174`) required `fn_user_has_course_access(auth.uid(), m.course_id)`. That access scoping is gone.

The committed integration test (`answer-options-isolation.integration.test.ts:95-138`) actually demonstrates this: it creates a throwaway learner with zero role-group access, queries `answer_options_public` for an arbitrary `question_id` discovered via the service-role client, and asserts the read succeeds. The test is named "isolation" but it confirms cross-course read access.

Practical impact: a learner can enumerate question IDs (the `questions` table is still RLS-scoped) for their own quizzes, but if they obtain a question ID from another course (out-of-band, leaked URL, social-engineering, future endpoint that returns IDs), they can pull the option text and ordering. Combined with quiz attempts being inserted with `responses` JSON, this is a moderate quiz-integrity issue: distractor copy and option ordering for any quiz are visible.

Fix:

```sql
-- Replace the unscoped view with one that re-applies the access predicate
create or replace view public.answer_options_public
  with (security_invoker = on) as
  select id, question_id, option_text, sort_order
  from public.answer_options;

-- Recreate the learner SELECT policy on the underlying table, scoped by course access
create policy answer_options_learner_read on public.answer_options
  for select using (
    exists (
      select 1 from public.questions q
      join public.lessons l on l.quiz_id = q.quiz_id
      join public.modules m on m.id = l.module_id
      where q.id = answer_options.question_id
        and public.fn_user_has_course_access(auth.uid(), m.course_id)
    )
  );
```

With `security_invoker = on` the view delegates to the underlying RLS, which is the original behavior plus column projection. The integration test will need to be updated to assert that out-of-scope question IDs return zero rows; right now it asserts the opposite.

If the team prefers to keep the underlying SELECT revoked from `authenticated`, the alternative is to define a view that joins `questions/lessons/modules` and filters by `fn_user_has_course_access(auth.uid(), m.course_id)` directly in the view body. Either approach restores the access boundary.

### CR-02: Expired invite still authenticates the user

BLOCKER. Account creation is not undone when the invite is rejected.

File: `src/app/auth/callback/route.ts:27-41`

Sequence:

1. `supabase.auth.exchangeCodeForSession(code)` runs first and creates the auth.users row plus the cookie session. The `handle_new_user` trigger creates a default `profiles` row with `system_role = 'learner'`.
2. `applyInvite` then checks `expires_at`. On expiry it returns `{ ok: false, reason: "expired" }`.
3. The route redirects to `/login?error=invite_expired`.

By step 3 the auth.users row exists, the session cookie is set, and the user has a learner profile. They can:

- Click the back button or paste `/dashboard` into the URL bar — the middleware sees a valid session and lets them through.
- Use any future password-set flow that lands them in the app.

The expiry check therefore blocks role escalation (no `system_role` update, no `user_role_groups` insert) but not authentication. The advertised security property in plan 1-2 ("expired invite tokens redirect ... before any role write") is honored, but the user is still authenticated as a learner with a default profile.

Fix: when `applyInvite` returns expired, sign the session out and delete the freshly created auth.users row before redirecting. Because the trigger has already populated `profiles`, the cascade FK on `auth.users(id)` will clean up the profile.

```ts
if (!result.ok && result.reason === "expired") {
  // Tear down the session and the freshly created auth.users row so the
  // expired token can't be used for de-facto signup.
  await supabase.auth.signOut();
  try {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(data.session.user.id);
  } catch {
    // If the admin client is unavailable, the session is at least gone.
  }
  return NextResponse.redirect(`${origin}/login?error=invite_expired`);
}
```

A regression test should cover: (a) session is cleared, (b) auth.users row is gone, (c) `/dashboard` does not return a 200 for the expired-invite user.

The unit test in `route.test.ts:102-116` only checks the discriminated-union return; it cannot catch this because it mocks the admin client and never exercises the GET handler. Add a route-level test or an integration test that exchanges a real expired invite and asserts the auth.users row is removed.

## Warnings

### WR-01: Em dash in user-facing error message

File: `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:32`

```ts
error: "You can't downgrade your own role — you'd lock yourself out.",
```

The em dash violates the writing-style rule in AGENTS.md ("No em dashes"). This string is returned to the user via `toast.error` in `user-edit-form.tsx:54`.

Fix: replace the em dash with a comma or a period, e.g. `"You can't downgrade your own role. You'd lock yourself out."` or `"You can't downgrade your own role, you'd lock yourself out."`

### WR-02: Em-dash placeholder character used throughout report tables

Files:
- `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx:233, 236`
- `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx:330, 333`
- `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx:281, 352`
- `src/app/(dashboard)/admin/reports/page.tsx:169`

Each of these renders a literal `"—"` (em dash) as the placeholder for missing values in admin report tables. Visible to admins as cell content. Same writing-style violation as WR-01.

Fix: replace with an en dash, hyphen, or just an empty string. The codebase has prior art for en-dash (`–`) in older admin tables; a hyphen-minus (`-`) is also acceptable.

### WR-03: Misleading "active learners" column on the Courses report

File: `src/app/(dashboard)/admin/reports/page.tsx:441-461` (and `:186-217` for the table header)

```ts
function summarizeByCourse({ courses, courseCerts, completions }) {
  const certCountByCourse = groupCount(courseCerts, (c) => c.course_id);
  const activeLearnerCount = new Set(completions.map((c) => c.user_id)).size;
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    activeLearners: activeLearnerCount,  // same value for every course
    completedCount: certCountByCourse.get(c.id) ?? 0,
  }));
}
```

`activeLearnerCount` is the count of distinct users with ANY lesson completion in the system. It is then assigned to every course row. The column header reads "Learners with completed lessons" which suggests per-course scoping; admins will read it as "this many learners completed lessons in THIS course" and act on the wrong information.

The MVP-skip comment acknowledges the shortcut, but rendering the same number on every row is worse than rendering nothing or "—". This is incorrect data shown to administrators.

Fix options, in increasing rigor:
- Hide the column until the lessons-to-course join is implemented.
- Render `—` (after fixing WR-02) and add a tooltip explaining the missing join.
- Implement the join: fetch `modules.course_id` for every lesson_id in `completions`, group by course.

### WR-04: `deleteUser` last-owner check is non-transactional

File: `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts:165-178`

```ts
const { count } = await supabase
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("system_role", "owner");
if ((count ?? 0) <= 1) {
  return { ok: false, error: "Can't delete the last owner." };
}
```

The count is read from the learner-session client (RLS-scoped) and the actual delete happens via the service-role admin client. Two admins clicking "Delete" on the only two remaining owners at the same time will each observe `count = 2`, both will pass the guard, and both deletes will succeed. The org is then left ownerless and the system is in a state the guard was meant to prevent.

Likelihood is low for a small team but the operation is irreversible. Consider one of:

- Move the guard into a Postgres function that performs the count and the delete in the same transaction (with `SELECT ... FOR UPDATE` on the owner rows).
- Add a deferred constraint or trigger that refuses to delete the last owner at the DB layer (this is the more robust path because it survives any future delete path, including direct SQL in the dashboard).
- Document the race in the action with a `// known limitation` comment so it is not lost.

Also: the count query runs against the learner-session client (`createClient()`), so it is subject to the RLS policy on `profiles`. If admins cannot see all owner profiles for any reason, the count will be wrong. A service-role count would be more robust.

### WR-05: Admin users list page lacks a page-level `requireAdmin()`

File: `src/app/(dashboard)/admin/users/page.tsx:26-38`

```ts
export default async function AdminUsersPage() {
  const supabase = await createClient();
  const [profiles, invites, roleGroups] = await Promise.all([...]);
```

This page does not call `requireAdmin()` itself. It relies entirely on `(dashboard)/admin/layout.tsx` for access control, which is the exact gap HARDEN-01 closed for the reports tree. The defense-in-depth rationale ("a direct fetch can't bypass the layout") in the HARDEN-01 commit message applies here too. If HARDEN-01 was worth doing for reports, it is also worth doing for admin/users — that page reads `profiles`, `invites`, `role_groups` and renders pending invite tokens by id, none of which should ever reach a learner's response.

Fix: add `await requireAdmin();` as the first statement of `AdminUsersPage`, mirroring the four report pages, and add a regression test in the same shape as `reports/page.test.ts`.

(This is not strictly part of the HARDEN-01 ticket scope, but the inconsistency is visible after this phase and surfaces a real defense-in-depth gap.)

## Info

### IN-01: `applyInvite` swallows admin-client construction errors as success

File: `src/app/auth/callback/route.ts:67-74`

```ts
try {
  admin = createAdminClient();
} catch {
  return { ok: true };
}
```

If `SUPABASE_SERVICE_ROLE_KEY` is misconfigured in production, every invited user will silently receive only the default `learner` profile with no role groups, and the comment ("user still lands with a 'learner' profile and can be upgraded by hand") implies an admin will notice. In practice no one notices until a user complains. Consider logging the error before returning and/or surfacing the failure as a non-200 response so an alert fires.

The current behavior is intentional per the comment, so this is a low-priority observation rather than a bug.

### IN-02: Cross-test mutable module state in `actions.test.ts`

File: `src/app/(dashboard)/admin/users/[userId]/edit/actions.test.ts:6-9`

```ts
let actor: Profile = { id: "admin-1", email: "a@b.com", system_role: "admin" };
let targetRow: { system_role: string } | null = null;
let ownerCount = 0;
let adminFactoryThrows: Error | null = null;
```

Module-scope `let` bindings shared across every test. Vitest runs tests within a file serially by default, so this works today. If the file is ever split or `concurrent: true` is enabled on a test, the shared state will produce flaky results. Encapsulate in a per-test `beforeEach` factory or move to a context object.

### IN-03: Persistent `?error=invite_expired` in URL after a successful sign-in

File: `src/app/(auth)/login/page.tsx:42-55`

If a user lands at `/login?error=invite_expired`, fixes their invite, and then signs in successfully, the redirect on success comes from the action's `next` param, so the error param does not persist post-login. However, if signin then fails (wrong password) the action error takes precedence over the URL error (good) but the URL still says `error=invite_expired`, which is mildly confusing if they reload the page.

Low-priority polish: clear the `?error=` param via a router replace once the form is interacted with. Not a bug, just UX nit.

### IN-04: `inviteUserByEmail` uses email as the side-channel for invite tokens

File: `src/app/(dashboard)/admin/users/actions.ts:70-79`, `:274-290` (resend)

The redirectTo URL embeds the invite token as a query parameter (`?invite_token=...`). Email transit and any URL-logging proxy along the way will see the token. This is the established pattern for the codebase and matches the original `inviteUser` flow, so this is not a regression introduced by this phase. Worth noting as an existing risk that should be addressed separately: rotate to a one-time-use token + opaque short code OR rely entirely on the Supabase invite flow without a custom side-channel token.

(Logged for visibility only — not in scope for HARDEN-02.)

---

_Reviewed: 2026-04-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
