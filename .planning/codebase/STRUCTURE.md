# Codebase Structure

**Analysis Date:** 2026-04-30

## Directory Layout

```
bmh-institute/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root HTML shell (fonts, Toaster)
│   │   ├── page.tsx                # Redirects / → /dashboard
│   │   ├── globals.css             # Tailwind base styles
│   │   ├── (auth)/                 # Unauthenticated pages (no shell)
│   │   │   ├── login/
│   │   │   │   ├── page.tsx
│   │   │   │   └── actions.ts      # signIn server action
│   │   │   └── forgot-password/
│   │   │       ├── page.tsx
│   │   │       └── actions.ts
│   │   ├── (dashboard)/            # Authenticated shell (header + sidebar)
│   │   │   ├── layout.tsx          # Shell: auth check, profile, pending count
│   │   │   ├── sidebar-nav.tsx     # Client component — active-link nav
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx        # Learner home — programs + progress
│   │   │   ├── courses/
│   │   │   │   └── [courseId]/
│   │   │   │       └── page.tsx    # Course detail — modules + lesson list
│   │   │   ├── lessons/
│   │   │   │   └── [lessonId]/
│   │   │   │       ├── page.tsx           # Lesson view (content/quiz/assignment)
│   │   │   │       ├── actions.ts         # markLessonComplete, markBlockComplete
│   │   │   │       ├── quiz-actions.ts    # submitQuizAttempt
│   │   │   │       ├── quiz-runner.tsx    # Client component — quiz UI
│   │   │   │       ├── assignment-actions.ts  # submitAssignment
│   │   │   │       ├── assignment-runner.tsx  # Client component — assignment UI
│   │   │   │       └── mark-complete-button.tsx
│   │   │   ├── certificates/
│   │   │   │   ├── page.tsx               # Learner's earned certificates list
│   │   │   │   ├── print-button.tsx       # Client — window.print()
│   │   │   │   ├── course/[certId]/page.tsx
│   │   │   │   └── program/[certId]/page.tsx
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── actions.ts
│   │   │   │   └── profile-forms.tsx
│   │   │   └── admin/                     # Role-gated sub-tree
│   │   │       ├── layout.tsx             # requireAdmin() gate
│   │   │       ├── page.tsx               # Overview stats
│   │   │       ├── courses/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── actions.ts
│   │   │       │   ├── course-form.tsx
│   │   │       │   ├── new/page.tsx
│   │   │       │   └── [courseId]/edit/
│   │   │       │       ├── page.tsx
│   │   │       │       └── modules-editor.tsx
│   │   │       ├── lessons/
│   │   │       │   └── [lessonId]/edit/
│   │   │       │       ├── page.tsx
│   │   │       │       ├── actions.ts          # CRUD for blocks + lesson details
│   │   │       │       ├── blocks-editor.tsx   # Client — drag/add/delete blocks
│   │   │       │       ├── lesson-details-form.tsx
│   │   │       │       ├── quiz-actions.ts
│   │   │       │       ├── quiz-editor.tsx
│   │   │       │       ├── assignment-actions.ts
│   │   │       │       └── assignment-editor.tsx
│   │   │       ├── programs/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── actions.ts
│   │   │       │   ├── program-form.tsx
│   │   │       │   ├── new/page.tsx
│   │   │       │   └── [programId]/edit/
│   │   │       │       ├── page.tsx
│   │   │       │       └── course-attachments.tsx
│   │   │       ├── users/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── actions.ts          # inviteUser, revokeInvite, setUserRoleGroups
│   │   │       │   ├── invite-form.tsx
│   │   │       │   ├── revoke-invite-button.tsx
│   │   │       │   └── [userId]/edit/
│   │   │       │       ├── page.tsx
│   │   │       │       ├── actions.ts
│   │   │       │       └── user-edit-form.tsx
│   │   │       ├── submissions/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── actions.ts          # approveSubmission, requestRevision
│   │   │       │   └── review-controls.tsx
│   │   │       ├── role-groups/
│   │   │       │   ├── page.tsx
│   │   │       │   ├── actions.ts
│   │   │       │   └── role-groups-editor.tsx
│   │   │       └── reports/
│   │   │           ├── page.tsx
│   │   │           ├── courses/[courseId]/page.tsx
│   │   │           ├── programs/[programId]/page.tsx
│   │   │           └── users/[userId]/page.tsx
│   │   └── auth/                          # Supabase callback routes (no shell)
│   │       ├── callback/route.ts          # Code exchange + invite apply
│   │       ├── signout/route.ts
│   │       └── set-password/
│   │           ├── page.tsx
│   │           ├── actions.ts
│   │           └── set-password-form.tsx
│   ├── components/
│   │   ├── content-blocks.tsx             # Block renderer (10 types)
│   │   ├── video-block-player.tsx         # Client — video with 90% completion tracking
│   │   ├── file-upload.tsx                # Client — Supabase Storage uploader
│   │   └── ui/                            # shadcn/ui primitives (generated — do not edit)
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── select.tsx
│   │       ├── separator.tsx
│   │       ├── sheet.tsx
│   │       ├── skeleton.tsx
│   │       ├── sonner.tsx
│   │       ├── table.tsx
│   │       └── tooltip.tsx
│   ├── lib/
│   │   ├── utils.ts                       # cn() Tailwind class merger
│   │   ├── auth/
│   │   │   ├── guard.ts                   # getAuthedProfile(), requireAdmin()
│   │   │   ├── allowlist.ts               # isAdminEmail() from ADMIN_EMAILS env
│   │   │   └── allowlist.test.ts
│   │   ├── certificates/
│   │   │   ├── render.ts                  # renderCertificateHtml() merge-field hydration
│   │   │   └── render.test.ts
│   │   ├── content-blocks/
│   │   │   └── sign-urls.ts               # enrichBlocksWithSignedUrls() bulk signer
│   │   ├── courses/
│   │   │   ├── shape.ts                   # shapeCourseResponse() — normalise FK joins
│   │   │   ├── shape.test.ts
│   │   │   ├── validate.ts
│   │   │   └── validate.test.ts
│   │   ├── email/
│   │   │   ├── send.ts                    # sendEmail() via nodemailer SMTP
│   │   │   ├── enrollment.ts              # renderEnrollmentEmail()
│   │   │   ├── enrollment.test.ts
│   │   │   ├── new-submission.ts          # renderNewSubmissionEmail()
│   │   │   ├── new-submission.test.ts
│   │   │   ├── review.ts                  # renderApprovedEmail(), renderRevisionEmail()
│   │   │   └── review.test.ts
│   │   ├── invites/
│   │   │   ├── validate.ts                # parseInviteInput()
│   │   │   └── validate.test.ts
│   │   ├── programs/
│   │   │   ├── shape.ts                   # shapeProgramsResponse()
│   │   │   ├── shape.test.ts
│   │   │   ├── validate.ts
│   │   │   └── validate.test.ts
│   │   ├── quizzes/
│   │   │   ├── attempts.ts                # computeQuizEligibility()
│   │   │   ├── attempts.test.ts
│   │   │   ├── score.ts                   # scoreQuizAttempt()
│   │   │   ├── score.test.ts
│   │   │   ├── shuffle.ts
│   │   │   └── shuffle.test.ts
│   │   └── supabase/
│   │       ├── client.ts                  # Browser client (createBrowserClient)
│   │       ├── server.ts                  # SSR server client (cookie-based)
│   │       ├── admin.ts                   # Service-role client (bypasses RLS)
│   │       └── middleware.ts              # Session refresh + redirect logic
│   └── middleware.ts                      # Next.js middleware entry — delegates to lib
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_functions_and_triggers.sql  # Progress triggers, certificate auto-issue
│       ├── 003_rls_policies.sql
│       ├── 004_indexes.sql
│       ├── 005_seed_dev.sql
│       ├── 006_storage_content_bucket.sql
│       └── 007_storage_submissions_bucket.sql
├── e2e-prod/                              # Playwright e2e tests against production
├── .planning/
│   └── codebase/                         # GSD mapper output
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts                       # Unit test config
├── vitest.integration.config.ts           # Integration test config (real Supabase)
├── playwright.config.ts
├── playwright.prod.config.ts
└── AGENTS.md                              # Agent instructions
```

## Directory Purposes

**`src/app/(auth)/`:**
- Purpose: Unauthenticated pages — login and forgot-password
- No shared layout; renders standalone without the dashboard shell
- Key files: `login/page.tsx`, `login/actions.ts`, `forgot-password/page.tsx`, `forgot-password/actions.ts`

**`src/app/(dashboard)/`:**
- Purpose: All authenticated user-facing pages — learner and admin
- Shares `layout.tsx` which provides the header and sidebar shell
- Sub-trees: learner (`/dashboard`, `/courses`, `/lessons`, `/certificates`, `/profile`) and admin (`/admin/**`)

**`src/app/auth/`:**
- Purpose: OAuth/invite callback route handler and password-set flow
- Not inside `(dashboard)` — no shell, runs as API routes
- Key files: `callback/route.ts`, `signout/route.ts`, `set-password/page.tsx`

**`src/components/`:**
- Purpose: Shared React components used across multiple pages
- `content-blocks.tsx` and `video-block-player.tsx` are hand-authored domain components
- `ui/` contains shadcn/ui primitives — generated, do not manually edit

**`src/lib/`:**
- Purpose: Pure business logic, domain utilities, and Supabase client factories
- All files here are independently testable; `lib/` never imports from `app/`
- Each sub-module has a `.test.ts` pair co-located with the implementation

**`supabase/migrations/`:**
- Purpose: Sequential SQL migrations applied to the `bmh-institute` Supabase project
- File naming: `NNN_name.sql` applied in numeric order
- Triggers in `002_functions_and_triggers.sql` drive lesson completion → certificate issuance

**`e2e-prod/`:**
- Purpose: Playwright e2e tests run against the production Supabase project
- Config: `playwright.prod.config.ts`
- Generated: No. Committed: Yes.

## Key File Locations

**Entry Points:**
- `src/app/page.tsx` — Root redirect to `/dashboard`
- `src/app/layout.tsx` — HTML root, fonts, global providers
- `src/middleware.ts` — Session middleware, unauthenticated redirect

**Auth:**
- `src/lib/auth/guard.ts` — `getAuthedProfile()`, `requireAdmin()`
- `src/lib/supabase/server.ts` — SSR Supabase client (used in server components + actions)
- `src/lib/supabase/admin.ts` — Service-role client (invite wiring, role assignment)
- `src/app/auth/callback/route.ts` — Supabase callback + invite token application

**Core Learner Flow:**
- `src/app/(dashboard)/dashboard/page.tsx` — Programs + per-course progress
- `src/app/(dashboard)/courses/[courseId]/page.tsx` — Course outline with lock state
- `src/app/(dashboard)/lessons/[lessonId]/page.tsx` — Lesson renderer (content/quiz/assignment)
- `src/app/(dashboard)/lessons/[lessonId]/actions.ts` — Block/lesson completion actions
- `src/components/content-blocks.tsx` — Block renderer for all 10 block types
- `src/lib/content-blocks/sign-urls.ts` — Storage URL signing (runs before render)

**Admin:**
- `src/app/(dashboard)/admin/layout.tsx` — `requireAdmin()` gate
- `src/app/(dashboard)/admin/users/actions.ts` — `inviteUser`, `revokeInvite`, `setUserRoleGroups`
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` — Block CRUD
- `src/app/(dashboard)/admin/submissions/actions.ts` — `approveSubmission`, `requestRevision`

**Business Logic:**
- `src/lib/quizzes/attempts.ts` — Quiz eligibility (max attempts, cooldown, pass gate)
- `src/lib/quizzes/score.ts` — `scoreQuizAttempt()` — all-or-nothing per question
- `src/lib/certificates/render.ts` — `renderCertificateHtml()` merge-field substitution
- `src/lib/courses/shape.ts` — `shapeCourseResponse()` — PostgREST FK normalisation
- `src/lib/programs/shape.ts` — `shapeProgramsResponse()` — same for programs
- `src/lib/email/send.ts` — `sendEmail()` via nodemailer SMTP

**Database:**
- `supabase/migrations/001_initial_schema.sql` — Core tables
- `supabase/migrations/002_functions_and_triggers.sql` — Progress triggers, certificate logic
- `supabase/migrations/003_rls_policies.sql` — Row-level security

## Naming Conventions

**Files:**
- Route pages: `page.tsx` (Next.js convention)
- Route layouts: `layout.tsx`
- Server actions: `actions.ts` — co-located with the route segment they serve
- Feature-specific actions: `<feature>-actions.ts` (e.g., `quiz-actions.ts`, `assignment-actions.ts`)
- Client components: `kebab-case.tsx` (e.g., `quiz-runner.tsx`, `blocks-editor.tsx`)
- Lib utilities: `kebab-case.ts` (e.g., `sign-urls.ts`, `shape.ts`)
- Tests: co-located as `<file>.test.ts`

**Directories:**
- Route groups: `(group-name)` — no URL segment
- Dynamic segments: `[paramName]` — e.g., `[lessonId]`, `[courseId]`
- lib sub-modules: plural noun matching domain (e.g., `quizzes/`, `courses/`, `certificates/`)

**TypeScript:**
- Exported types use PascalCase: `ContentBlock`, `ProgramWithCourses`, `AuthedProfile`
- Server action return types are discriminated unions named `ActionResult` or `<Verb>Result`
- Exported functions use camelCase: `shapeCourseResponse`, `requireAdmin`, `enrichBlocksWithSignedUrls`

## Where to Add New Code

**New learner-facing page:**
- Route: `src/app/(dashboard)/<feature>/page.tsx`
- Data fetching: directly in the server component using `await createClient()` from `src/lib/supabase/server.ts`
- Interactive parts: separate client component in the same directory

**New admin page:**
- Route: `src/app/(dashboard)/admin/<feature>/page.tsx`
- Always within the admin sub-tree so `admin/layout.tsx` applies `requireAdmin()`
- Server actions: `src/app/(dashboard)/admin/<feature>/actions.ts` — begin with `await requireAdmin()`

**New server action (mutation):**
- Co-locate with the route segment: `<route-segment>/actions.ts`
- First line of every admin action: `await requireAdmin()`
- Last lines: `revalidatePath(...)` for every affected route, return `{ ok: true } | { ok: false; error: string }`

**New content block type:**
1. Add the type literal to `ContentBlock["block_type"]` union in `src/components/content-blocks.tsx`
2. Add a case to the `ContentBlockRenderer` switch
3. Add `DEFAULT_CONTENT` entry in `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts`
4. Add edit UI in `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx`
5. If the block uses Storage, `enrichBlocksWithSignedUrls` in `src/lib/content-blocks/sign-urls.ts` handles signing automatically via `content.file_path`

**New business logic utility:**
- Location: `src/lib/<domain>/<name>.ts`
- Co-locate test: `src/lib/<domain>/<name>.test.ts`
- Keep pure — no imports from `src/app/`

**New email template:**
- Location: `src/lib/email/<event>.ts` exporting a `render<Event>Email()` function
- Co-locate test: `src/lib/email/<event>.test.ts`
- Send via `sendEmail()` from `src/lib/email/send.ts` (fire-and-forget pattern)

**New migration:**
- Location: `supabase/migrations/NNN_name.sql` where NNN is the next sequential number
- Apply to production with `supabase db push`

**New shadcn/ui component:**
- Run `npx shadcn@latest add <component>` — output goes to `src/components/ui/`
- Do not manually author files in `src/components/ui/`

## Special Directories

**`.planning/`:**
- Purpose: GSD planning documents — phase plans, codebase maps
- Generated: Yes (by GSD mapper and planner agents)
- Committed: Yes

**`e2e-prod/`:**
- Purpose: Playwright e2e test suite against the production Supabase project
- Config: `playwright.prod.config.ts`
- Auth state: `.auth/` directory stores saved auth state (gitignored)

**`supabase/migrations/`:**
- Purpose: SQL migration history applied in order to the Supabase project
- Generated: No — hand-authored
- Committed: Yes

---

*Structure analysis: 2026-04-30*
