# Phase 1: Auth and Access Hardening - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the four auth and access gaps surfaced by `.planning/codebase/CONCERNS.md`:
HARDEN-01 (admin route guards on report pages), HARDEN-02 (invite expiry enforcement),
HARDEN-03 (true user deletion), and HARDEN-04 (hide quiz `is_correct` from learner sessions).
No new user-facing features. Every change ships with TDD coverage that did not exist before.

</domain>

<decisions>
## Implementation Decisions

### HARDEN-02 expired-invite UX
- **D-01:** Add a new `invite_expired` error code on `/login` distinct from the existing `invite_failed`. Login page renders dedicated copy: "This invite link has expired. Ask your admin to send you a fresh one."
- **D-02:** Auth callback does the expiry check post-fetch (`new Date(invite.expires_at) > new Date()`) and redirects to `/login?error=invite_expired` without applying any role assignment when expired.
- **D-03:** Admin invites list flags expired invites visually and exposes a Resend action that mints a new token with a fresh `expires_at`.

### HARDEN-03 delete vs suspend
- **D-04:** "Delete" becomes a true permanent delete: `deleteUser` calls `admin.auth.admin.deleteUser(userId)` then removes the `profiles` row. Suspend stays available as a separate reversible action via the existing edit form's `status` toggle (active / invited / suspended).
- **D-05:** Hard cascade on delete. Add `ON DELETE CASCADE` to FKs from `user_role_groups`, `user_lesson_completions`, `user_block_progress`, `user_quiz_attempts`, `assignment_submissions`, `course_certificates`, `program_certificates` to `profiles.id`. When a user is deleted their learning history goes with them. Internal-training context — no audit-preservation requirement.
- **D-06:** Self-delete guard stays (admins cannot delete themselves); add an equivalent guard to prevent the last `owner` from being deleted.

### HARDEN-04 answer-key isolation
- **D-07:** Migration creates view `answer_options_public` exposing `(id, question_id, option_text, sort_order)`. `GRANT SELECT` on the view to the `authenticated` role.
- **D-08:** `REVOKE SELECT` on `public.answer_options` from `authenticated`. Service role and admin sessions retain access (service role bypasses, admin policy already exists).
- **D-09:** Learner lesson page (`src/app/(dashboard)/lessons/[lessonId]/page.tsx`) reads from `answer_options_public`. Admin edit pages keep reading the underlying table.
- **D-10:** `submitQuizAttempt` (`src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts`) switches the `is_correct` fetch only to `createAdminClient()`. Other queries in that action stay on the learner client. Scoring logic (`src/lib/quizzes/score.ts`) is unchanged.

### Plan granularity
- **D-11:** Phase 1 ships as four parallel plans: `1-1 admin-route-guards`, `1-2 invite-expiry`, `1-3 user-deletion`, `1-4 answer-options-view`. File-disjoint so they run in parallel waves per the milestone-init "coarse granularity, parallel execution, YOLO" decision. Each plan carries its own test inventory, failing-tests commit, and implementation commit.

### Claude's Discretion
- Exact wording of the expired-invite UI copy and the admin invite-list "expired" badge styling.
- Whether the `Resend` invite control sends a fresh email or only mints a new token + shows the link to copy. Default: send a fresh email through the existing invite-email path.
- Migration filename numbering. Next free slot is `008_*` (current head is `007_storage_submissions_bucket.sql`); planner allocates per plan.

</decisions>

<specifics>
## Specific Ideas

- Admin-side resend should reuse the existing invite-email render path; no new template needed unless the planner finds the existing copy doesn't fit.
- The two existing `deleteUser` and `saveUserSettings` paths that both write `status = 'suspended'` are confusing today. Renaming/clarifying the admin UI is fair game inside HARDEN-03; the action name `deleteUser` is fine to keep — it just needs to actually delete.
- Revoking direct `is_correct` access must not break the admin lesson edit page (`src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx`) which legitimately reads `is_correct` via the existing admin policy.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules
- `AGENTS.md` — TDD with up-front test inventory, writing style, stack constraints, Hobby-plan limits
- `.planning/PROJECT.md` — locked decisions (TDD inventory mandatory, YOLO + coarse granularity, voice work belongs in Sandra Practice)
- `.planning/REQUIREMENTS.md` — HARDEN-01..04 acceptance criteria are LOCKED. Each criterion names the regression-test shape required.

### Codebase diagnosis (the reason this milestone exists)
- `.planning/codebase/CONCERNS.md` §"Security Considerations" — file-by-file findings with line numbers and recommendations for each HARDEN item. Read before planning the matching plan.
- `.planning/codebase/ARCHITECTURE.md` — auth/RLS layering and the three Supabase clients
- `.planning/codebase/STRUCTURE.md` §Auth layer, §Admin gate
- `.planning/codebase/CONVENTIONS.md` — server-action discriminated-union return shape, naming patterns, comment style
- `.planning/codebase/TESTING.md` — Vitest unit/integration split, Playwright write-path expectations, prod-config harness

### Schema and policy surface to mutate
- `supabase/migrations/001_initial_schema.sql` — `invites.expires_at`, `answer_options` table, FK definitions to `profiles.id`
- `supabase/migrations/003_rls_policies.sql` §answer_options (lines 162-177) — current learner_read + admin_all policies; new revoke goes alongside
- `supabase/migrations/004_indexes.sql` — index on `answer_options(question_id, sort_order)` must continue to serve the new view

### Code surfaces touched per HARDEN
- HARDEN-01: `src/app/(dashboard)/admin/reports/page.tsx`, `.../users/[userId]/page.tsx`, `.../courses/[courseId]/page.tsx`, `.../programs/[programId]/page.tsx`; guard at `src/lib/auth/guard.ts`
- HARDEN-02: `src/app/auth/callback/route.ts`, `src/app/(auth)/login/page.tsx` (error rendering), `src/app/(dashboard)/admin/invites/` (admin list + resend action)
- HARDEN-03: `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`, new migration adding `ON DELETE CASCADE` FKs
- HARDEN-04: new migration creating `answer_options_public` view + grants/revokes; `src/app/(dashboard)/lessons/[lessonId]/page.tsx` (line 230); `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts` (line 88); admin paths unchanged

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin()` in `src/lib/auth/guard.ts` — call at the top of each report page for HARDEN-01
- `createAdminClient()` in `src/lib/supabase/admin.ts` — already used in `applyInvite`; reused for `auth.admin.deleteUser` (HARDEN-03) and the scoring is_correct fetch (HARDEN-04)
- `scoreQuizAttempt()` in `src/lib/quizzes/score.ts` — pure function; consumes `correctOptionIds`, untouched by this phase
- Server-action discriminated union `{ ok: true } | { ok: false; error: string }` already used by `deleteUser` and `saveUserSettings` — preserved
- `?error=invite_failed` pattern in callback + login page is the precedent for adding `?error=invite_expired`
- Existing invite-email render path (`src/lib/email/`) — reused by Resend without a new template

### Established Patterns
- Admin mutations always go through a server action that calls `requireAdmin()` first (CONVENTIONS.md). All four plans follow this.
- RLS is the second auth layer; the service-role client bypasses it deliberately. HARDEN-04's REVOKE leans on this asymmetry.
- Migrations are appended in numeric order (`NNN_name.sql`); RLS goes in `003_rls_policies.sql` style files; new tables/views go in their own migration. Multiple HARDEN plans will each ship their own migration file.

### Integration Points
- `src/app/(dashboard)/admin/invites/` already lists invites with status — extend with expired badge + Resend
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/page.tsx:170` reads `is_correct` via the admin session — verify it still works after the REVOKE (admin role keeps access)
- The four HARDEN plans share zero source files except `requireAdmin()` (read-only) and `createAdminClient()` (read-only), so parallel execution is safe

</code_context>

<deferred>
## Deferred Ideas

- `isAdminEmail` allowlist dead code in `src/lib/auth/allowlist.ts` (CONCERNS.md flags it). Out of scope for HARDEN-01..04. Add to backlog as a tech-debt cleanup or fold into Phase 4 typing work.
- `NEXT_PUBLIC_APP_URL` triple-fallback inconsistency (CONCERNS.md flags it). Out of scope; backlog tech debt.
- Self-service "request a new invite" flow on `/login`. Out of scope — admin-resend covers HARDEN-02. If self-service is wanted later it becomes its own phase.
- Switching the entire scoring path to a `SECURITY DEFINER` RPC. Considered and explicitly rejected for HARDEN-04 in favour of view + admin-client. Re-open only if a future phase moves more business logic into Postgres.

</deferred>

---

*Phase: 01-auth-and-access-hardening*
*Context gathered: 2026-04-30*
