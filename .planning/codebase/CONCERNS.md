# Codebase Concerns

**Analysis Date:** 2026-04-30

## Security Considerations

**Admin report pages bypass the admin layout guard:**
- Risk: Any authenticated learner who navigates directly to an admin report URL can load it. The `AdminLayout` at `src/app/(dashboard)/admin/layout.tsx` calls `requireAdmin()`, but the four report pages — `src/app/(dashboard)/admin/reports/page.tsx`, `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx`, `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx`, and `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx` — do not call `requireAdmin()` themselves. Their routes sit inside the `/admin` segment so the layout guard should fire on navigation, but a direct fetch to the route handler would not trigger the layout. More critically, RLS on `program_access` and `course_access` is admin-only, so the complex join queries in `users/[userId]/page.tsx` (lines 56-74) run against those tables using the learner's session client and will silently return empty data rather than failing — meaning the data exposure is currently blocked by RLS, but the page renders with no access check of its own. Adding `requireAdmin()` at the top of each page function is the correct fix.
- Files: `src/app/(dashboard)/admin/reports/page.tsx`, `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx`, `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx`, `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx`
- Current mitigation: RLS on `program_access` and `course_access` prevents data leakage in practice. The `is_admin` RLS helper also gates `profiles` reads to self or shared-group only, so learner-session calls to admin report pages return partial or empty data.
- Recommendation: Call `await requireAdmin()` at the top of each report page function before any Supabase query.

**`is_correct` flag readable by learners via RLS — not stripped by a view:**
- Risk: The RLS comment in `supabase/migrations/003_rls_policies.sql` (line 163) explicitly notes "The is_correct flag should be stripped at the API layer or via a view before exposure." No view exists. Stripping is done in application code only: the lesson page query at `src/app/(dashboard)/lessons/[lessonId]/page.tsx` (line 221) deliberately omits `is_correct` from the `answer_options` select. However, a learner with direct Supabase API access (using the anon key, which is public) can query `answer_options` directly and read `is_correct` for any quiz they have course access to.
- Files: `supabase/migrations/003_rls_policies.sql` (line 163), `src/app/(dashboard)/lessons/[lessonId]/page.tsx` (line 221)
- Current mitigation: Application layer never selects `is_correct` for learner-facing quiz rendering. Scoring runs server-side in `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts`.
- Recommendation: Create a `answer_options_public` view that excludes `is_correct` and grant learner RLS against the view, then revoke direct table read from non-admin sessions.

**Invite token expiry not enforced in the callback:**
- Risk: `invites.expires_at` is set to `now() + interval '14 days'` in the schema (`supabase/migrations/001_initial_schema.sql` line 294), but `applyInvite()` in `src/app/auth/callback/route.ts` does not check `expires_at` before applying the invite's `system_role` and `role_group_ids`. An expired invite link that reaches the callback will still grant full access.
- Files: `src/app/auth/callback/route.ts` (lines 67-96)
- Current mitigation: Supabase's own invite flow expires the OTP independently; the risk window is narrow.
- Recommendation: Add `and invite.expires_at > now()` to the `applyInvite` lookup, or compare `new Date(invite.expires_at) > new Date()` before applying roles.

**`deleteUser` only suspends the profile — does not remove the `auth.users` record:**
- Risk: Calling `deleteUser` from `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` sets `status = 'suspended'` on the `profiles` row but leaves `auth.users` intact. The suspended user can still sign in using Supabase Auth (their email/password still works). Profile suspension only blocks app-layer display; it does not prevent authentication.
- Files: `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` (lines 154-172)
- Current mitigation: A suspended user cannot perform meaningful actions if all downstream queries gate on `status = 'active'`, but this is not currently enforced by RLS.
- Recommendation: Use `createAdminClient()` to call `admin.auth.admin.deleteUser(userId)` (the service-role key is already present for invite flows), or at minimum add a RLS policy that blocks all table reads for `status = 'suspended'` profiles.

**`isAdminEmail` allowlist is not connected to auth or RLS:**
- Risk: `src/lib/auth/allowlist.ts` exports `isAdminEmail()` but nothing in the codebase imports it except its own test file (`src/lib/auth/allowlist.test.ts`). It was likely intended to promote a profile on first sign-in but the logic was never wired. Admin promotion is handled entirely through `invites.system_role` via the callback. The allowlist is dead code but also a possible source of confusion — a developer may rely on it for promotion and find it has no effect.
- Files: `src/lib/auth/allowlist.ts`
- Recommendation: Either wire `isAdminEmail()` into `handle_new_user()` trigger or the callback, or delete the file and its test to remove the confusion.

**Embed block has no URL allowlist or sandbox attribute:**
- Risk: Admins can enter any `iframe_src` into an embed block. The `EmbedBlock` in `src/components/content-blocks.tsx` (line 272) renders the iframe with no `sandbox` attribute and no origin validation. A malicious or accidental admin-entered URL could load arbitrary cross-origin content inside the lesson page.
- Files: `src/components/content-blocks.tsx` (lines 271-278), `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx` (lines 825-859)
- Current mitigation: Only admins can create/edit blocks; no XSS vector for learners. Risk is admin error rather than external attack.
- Recommendation: Add `sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"` to the embed iframe and optionally restrict `iframe_src` to an allowlist of known safe domains.

**`dangerouslySetInnerHTML` for admin-authored `body_html` in certificate templates:**
- Risk: `src/app/(dashboard)/certificates/course/[certId]/page.tsx` (line 100) and `src/app/(dashboard)/certificates/program/[certId]/page.tsx` render certificate HTML via `dangerouslySetInnerHTML`. The `renderCertificateHtml` function in `src/lib/certificates/render.ts` correctly escapes merge-field values, but the surrounding `body_html` template itself is injected raw. An admin who edits a certificate template with a `<script>` tag in the body will execute that script in any learner's browser.
- Files: `src/app/(dashboard)/certificates/course/[certId]/page.tsx` (line 100), `src/lib/certificates/render.ts`
- Current mitigation: Only admins can edit certificate templates; not an external attack surface.
- Recommendation: Sanitize `body_html` with a server-side HTML sanitizer (e.g., `sanitize-html`) before interpolation, or document explicitly that templates are admin-trusted-only.

**`dangerouslySetInnerHTML` for admin-authored text blocks:**
- Risk: `TextBlock` in `src/components/content-blocks.tsx` (line 125) renders `block.content.html` via `dangerouslySetInnerHTML` with no sanitization. Content is authored by admins and stored in `content_blocks.content` (jsonb). Same trust boundary as certificates — admin-only creation, but raw HTML passes through to learner browsers.
- Files: `src/components/content-blocks.tsx` (line 125)
- Current mitigation: Only admins write content blocks; RLS blocks learner writes.
- Recommendation: Sanitize on read or sanitize on write in the admin action.

**No rate limiting on password reset and forgot-password actions:**
- Risk: `src/app/(auth)/forgot-password/actions.ts` calls `supabase.auth.resetPasswordForEmail()` on every form submit with no application-layer throttle. Supabase's built-in rate limiting applies but is not configurable in the app code, and the default is permissive.
- Files: `src/app/(auth)/forgot-password/actions.ts`
- Recommendation: Add server action-level rate limiting or rely on Supabase Auth's configurable rate limits in the project dashboard.

## Tech Debt

**`user_role_groups` rewritten atomically in two separate places without a transaction:**
- Issue: Both `setUserRoleGroups` in `src/app/(dashboard)/admin/users/actions.ts` (lines 215-234) and `saveUserSettings` in `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` (lines 73-88) delete all rows then re-insert. There is no Postgres transaction wrapping these two calls. If the insert fails after the delete, the user ends up with no role groups and loses all access silently.
- Files: `src/app/(dashboard)/admin/users/actions.ts`, `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`
- Impact: Data integrity loss on partial failure; user locked out of courses with no error surfaced.
- Fix approach: Use a Postgres function (`SECURITY DEFINER`) that wraps the delete-insert in a single transaction, called via `supabase.rpc()`.

**Module reordering uses three sequential UPDATE calls without a transaction:**
- Issue: `reorderModule` in `src/app/(dashboard)/admin/courses/actions.ts` (lines 183-199) performs three separate `UPDATE` queries to swap sort_order values, using a temporary negative value as a pivot. These are not atomic — a server crash or Supabase timeout mid-sequence leaves sort_order in an inconsistent state.
- Files: `src/app/(dashboard)/admin/courses/actions.ts`
- Impact: Module order corruption on rare failures; no user-facing error.
- Fix approach: Use a single Postgres function with a `BEGIN/COMMIT` block, or restructure to a single update using a CASE expression.

**`deleteUser` does not call `auth.admin.deleteUser` — documented as a manual step:**
- Issue: Inline comment in `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts` (line 162) says to use the Supabase dashboard for full auth record deletion. The UI surface suggests to admins that the user is "deleted" but they remain in `auth.users` and can re-authenticate.
- Files: `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`
- Impact: Suspended users can sign in; misleading admin UX.
- Fix approach: Use the already-available `createAdminClient()` to call `admin.auth.admin.deleteUser(userId)` after suspending the profile.

**Extensive use of `as string`, `as number`, `as boolean` type assertions on Supabase query results:**
- Issue: Report pages and lesson pages use direct type assertions on Supabase results throughout, e.g. `c.lesson_id as string` in `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` (line 123). This suppresses TypeScript's ability to catch schema drift.
- Files: `src/app/(dashboard)/admin/reports/page.tsx`, `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx`, `src/app/(dashboard)/admin/reports/courses/[courseId]/page.tsx`, `src/app/(dashboard)/admin/reports/programs/[programId]/page.tsx`, `src/app/(dashboard)/lessons/[lessonId]/page.tsx`
- Impact: Schema changes will not produce type errors; runtime surprises possible.
- Fix approach: Generate Supabase types with `supabase gen types` and use the generated `Database` type in the Supabase client, then remove manual assertions.

**`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` use non-null assertion with no startup validation:**
- Issue: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, and `src/lib/supabase/middleware.ts` use `!` to assert these vars are defined. If they are missing the app silently passes `undefined` to `createServerClient`, producing confusing downstream errors rather than a clear startup failure.
- Files: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- Impact: Difficult to diagnose misconfiguration in preview deployments.
- Fix approach: Add explicit guards matching the pattern used in `src/lib/supabase/admin.ts` (which throws clearly).

**`NEXT_PUBLIC_APP_URL` has three different fallback values across the codebase:**
- Issue: `src/app/(auth)/forgot-password/actions.ts` falls back to `https://sandra-university.vercel.app`. `src/app/(dashboard)/admin/users/actions.ts` falls back to `http://localhost:3100`. `src/app/(dashboard)/admin/submissions/actions.ts` and `src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts` fall back to `https://sandra-university.vercel.app`. Mixed fallbacks mean invite links and submission notification links point to different origins depending on which code path runs.
- Files: `src/app/(auth)/forgot-password/actions.ts`, `src/app/(dashboard)/admin/users/actions.ts`, `src/app/(dashboard)/admin/submissions/actions.ts`, `src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts`
- Fix approach: Centralize into a single `src/lib/config.ts` that exports `appUrl` with one validated fallback.

## Performance Bottlenecks

**Admin reports overview page fetches all rows from seven tables with no pagination:**
- Problem: `src/app/(dashboard)/admin/reports/page.tsx` executes nine parallel Supabase queries (profiles, programs, courses, certificates, program_certificates, user_lesson_completions, audit_log, user_quiz_attempts, assignment_submissions) with no `.limit()` except on audit_log. At scale this page will load all learner completions and all quiz attempts into server memory for in-process aggregation.
- Files: `src/app/(dashboard)/admin/reports/page.tsx` (lines 24-58)
- Cause: Aggregation is done in TypeScript rather than in Postgres using the existing `fn_course_completion_percent` and `fn_program_completion_percent` functions.
- Improvement path: Push aggregation into Postgres views or RPCs; add pagination to the learner table; load the audit log section lazily.

**User report page fetches all modules and lessons across all courses to compute per-course progress:**
- Problem: `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` fetches every module and lesson in the database (no `course_id` filter on the modules query, line 76) to build a progress map. For a platform with many courses this grows linearly with total lesson count regardless of how many courses the user is enrolled in.
- Files: `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` (lines 75-79)
- Cause: The query at line 76 is `supabase.from("modules").select("id, course_id, lessons(id, is_required_for_completion)")` with no `.in("course_id", ...)` filter.
- Improvement path: Filter to only the user's accessible course IDs, or replace with the `fn_course_completion_percent` RPC.

**Dashboard progress computation uses two queries + in-process join instead of the existing Postgres RPC:**
- Problem: `src/app/(dashboard)/dashboard/page.tsx` (lines 56-94) fetches all modules with their lessons across all enrolled courses, then fetches all the learner's completions, and joins them in TypeScript. The database already has `fn_course_completion_percent(user_id, course_id)`. At a few hundred lessons the current approach is fine; at scale it is unnecessarily chatty.
- Files: `src/app/(dashboard)/dashboard/page.tsx`
- Cause: Comment on line 52 says "two cheap queries rather than a stored RPC to keep the model simple." This is a documented tradeoff, not a bug.
- Improvement path: Replace with `supabase.rpc("fn_course_completion_percent", ...)` per course ID when lesson volume grows.

**Signed URL generation does one bulk call but is uncached — repeated on every lesson page load:**
- Problem: `src/lib/content-blocks/sign-urls.ts` calls `createSignedUrls` with a 1-hour TTL on every lesson page render. There is no caching layer; two users loading the same lesson in the same second each trigger a Storage API call.
- Files: `src/lib/content-blocks/sign-urls.ts`
- Improvement path: Cache signed URLs in Next.js `unstable_cache` keyed on `(lessonId, file_path)` with a revalidation window shorter than the TTL.

## Fragile Areas

**Lesson completion trigger chain is invisible from the app layer:**
- Files: `supabase/migrations/002_functions_and_triggers.sql` (lines 353-498)
- Why fragile: Three separate database triggers (`trg_user_block_progress_after_insert`, `trg_user_quiz_attempts_after_change`, `trg_assignment_submissions_after_approval`) call `fn_issue_course_certificate_if_eligible` and `fn_issue_program_certificate_if_eligible`. These trigger chains cannot be tested with Vitest (they require a live Supabase instance). If a trigger throws, the insert still succeeds (they are `AFTER` triggers), but the completion and certificate records are never created. Failures are silent from the learner's perspective.
- Safe modification: Any change to completion or certificate logic must be tested with `npm run test:integration`. Add explicit integration test coverage for the trigger chain.
- Test coverage: No integration tests currently cover the trigger-driven completion/certificate flow.

**`fn_next_certificate_number` has a race condition under concurrent completions:**
- Files: `supabase/migrations/002_functions_and_triggers.sql` (lines 252-278)
- Why fragile: The function selects `max(certificate_number)` from both certificate tables, increments it, then inserts. Two concurrent completions within the same millisecond can read the same max and attempt to insert the same `certificate_number`, which has a `UNIQUE` constraint. The insert will fail for one of them, leaving one learner without a certificate.
- Safe modification: Wrap in `SELECT ... FOR UPDATE` or use a Postgres sequence instead of a computed max.

**The `role_play` embed seam is entirely unimplemented but partially designed:**
- Files: `role-play-embed-contract.md` (untracked), `src/components/content-blocks.tsx` (embed block used as stopgap)
- Why fragile: Admins can currently use the generic `embed` block to paste a role-play URL. There is no `role_play` block type, no JWT minting, no `postMessage` listener, no `role_play_results` table, and no reporting. Completion must be triggered manually via the "Mark complete" button. The contract document defines the full spec but none of it exists in code yet. Until migration 008 and `src/lib/role-plays/embed-token.ts` are built, role-play completion tracking is a manual process.
- Test coverage: None.

**Assignment file upload stores `submission_file_path` as a plain string with no validation of the storage path prefix:**
- Files: `src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts` (lines 50-58)
- Why fragile: The server action accepts `submission_file_path` as a string from the client. RLS in `supabase/migrations/007_storage_submissions_bucket.sql` enforces that uploads land in `{user_id}/...`, but the database row's `submission_file_path` field is written with whatever string the client provides. A learner could provide a path pointing to another learner's file without violating the RLS insert policy on `assignment_submissions`.
- Safe modification: Validate server-side that `submission_file_path` begins with `${user.id}/` before inserting.

**Sort order reordering for modules uses a temporary negative sentinel that is not cleaned up on partial failure:**
- Files: `src/app/(dashboard)/admin/courses/actions.ts` (lines 183-199)
- Why fragile: The three-step swap sets `sort_order = -1 - idx` as a placeholder. If the second or third update fails, a module row permanently holds a negative sort_order, which will cause it to sort before all other modules on next page load.
- Safe modification: Wrap all three updates in a Postgres RPC with a transaction.

## Missing Critical Features

**No Supabase type generation:**
- Problem: The project has no `supabase/generated-types.ts` or equivalent. All Supabase query results are typed via manual `as` assertions. Schema drift between migrations and TypeScript is undetected until runtime.
- Blocks: Safe refactors of any query touching the database.

**No integration tests for the trigger-driven completion pipeline:**
- Problem: The most critical business logic (lesson completion, certificate issuance, program completion gating) runs inside Postgres triggers that cannot be exercised by Vitest. `npm run test:integration` exists as a script but there are no integration test files.
- Blocks: Confidence when modifying `supabase/migrations/002_functions_and_triggers.sql`.

**No user-facing error boundary for failed Supabase queries in learner pages:**
- Problem: Several Server Components (e.g. `src/app/(dashboard)/lessons/[lessonId]/page.tsx`, `src/app/(dashboard)/dashboard/page.tsx`) use `?? []` or `?? null` to swallow Supabase errors silently. A learner whose query fails sees an empty page rather than an actionable error message.
- Files: `src/app/(dashboard)/lessons/[lessonId]/page.tsx`, `src/app/(dashboard)/dashboard/page.tsx`

## Test Coverage Gaps

**Auth callback and invite application flow:**
- What is not tested: `src/app/auth/callback/route.ts` — the code path that exchanges the code, applies invite roles, and redirects. Includes the invite expiry gap noted above.
- Files: `src/app/auth/callback/route.ts`
- Risk: A regression in role application during invite acceptance would go unnoticed until a real invite is sent.
- Priority: High

**Assignment submission server action:**
- What is not tested: `src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts` — no unit or integration test for the submission insert, file path validation, or notification email.
- Files: `src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts`
- Risk: File path injection (see Fragile Areas) and broken submission flow are undetected.
- Priority: High

**Admin submission review actions:**
- What is not tested: `src/app/(dashboard)/admin/submissions/actions.ts` — `approveSubmission` and `requestRevision` are untested. These trigger the completion pipeline and send email.
- Files: `src/app/(dashboard)/admin/submissions/actions.ts`
- Priority: High

**Password reset flow:**
- What is not tested: `src/app/(auth)/forgot-password/actions.ts` and `src/app/auth/set-password/actions.ts` have no unit coverage.
- Files: `src/app/(auth)/forgot-password/actions.ts`, `src/app/auth/set-password/actions.ts`
- Risk: Regressions in the only self-service recovery path go undetected.
- Priority: Medium

**Certificate rendering with real merge fields and XSS payloads:**
- What is not tested: `src/lib/certificates/render.test.ts` tests the renderer but does not test `body_html` containing `<script>` tags or other injection payloads to verify they are not executed. The `escapeHtml` function handles field values but not the template itself.
- Files: `src/lib/certificates/render.test.ts`, `src/lib/certificates/render.ts`
- Priority: Medium

**E2E coverage is read-only and smoke-test only:**
- What is not tested: All e2e tests in `e2e-prod/` are read-only UI smoke tests (page renders, links visible). No e2e test exercises a write path: invite flow, quiz submission, assignment upload, admin review, or password reset.
- Files: `e2e-prod/admin.spec.ts`, `e2e-prod/dashboard.spec.ts`
- Risk: Complete feature regressions on write paths would not be caught before deploy.
- Priority: High

---

*Concerns audit: 2026-04-30*
