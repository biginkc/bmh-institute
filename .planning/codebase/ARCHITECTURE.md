<!-- refreshed: 2026-04-30 -->
# Architecture

**Analysis Date:** 2026-04-30

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                             │
│   Client Components: sidebar-nav, quiz-runner, assignment-runner,    │
│   blocks-editor, mark-complete-button, review-controls               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ HTTP / RSC streaming
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (server)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ (auth) group │  │  Route group │  │     API routes           │   │
│  │ /login       │  │ (dashboard)  │  │  /auth/callback          │   │
│  │ /forgot-pwd  │  │ /dashboard   │  │  /auth/signout           │   │
│  └──────────────┘  │ /courses     │  │  /auth/set-password      │   │
│                    │ /lessons     │  └──────────────────────────┘   │
│                    │ /certificates│                                   │
│                    │ /admin/...   │                                   │
│                    └──────────────┘                                   │
│                           │                                           │
│            Server Actions (actions.ts per route segment)              │
│   "use server" — auth check → Supabase mutation → revalidatePath      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ @supabase/ssr / service-role client
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Supabase (sandra-university)                    │
│  Auth (invite-only)  ·  Postgres + RLS  ·  Storage (content/        │
│  submissions buckets)  ·  DB triggers (progress → certificates)      │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Key Files |
|-----------|----------------|-----------|
| Middleware | Session refresh + unauthenticated redirect | `src/middleware.ts`, `src/lib/supabase/middleware.ts` |
| Auth guard | `requireAdmin()` / `getAuthedProfile()` used in layouts and actions | `src/lib/auth/guard.ts` |
| Dashboard layout | Checks auth, resolves `system_role`, renders header + sidebar | `src/app/(dashboard)/layout.tsx` |
| Admin layout | Calls `requireAdmin()` — hard gate for all `/admin/*` routes | `src/app/(dashboard)/admin/layout.tsx` |
| Server pages | Fetch data server-side, pass typed props to client sub-components | `src/app/(dashboard)/**/page.tsx` |
| Server actions | Mutate Supabase, call `requireAdmin()` where needed, `revalidatePath` | `src/app/**/actions.ts` |
| `ContentBlockRenderer` | Switch-dispatches on `block_type` to typed sub-renderers | `src/components/content-blocks.tsx` |
| `enrichBlocksWithSignedUrls` | Bulk-signs storage paths before rendering | `src/lib/content-blocks/sign-urls.ts` |
| `shapeCourseResponse` | Normalises PostgREST nested-join response into typed tree | `src/lib/courses/shape.ts` |
| `shapeProgramsResponse` | Same normalisation for programs-with-courses | `src/lib/programs/shape.ts` |
| Quiz logic | Eligibility (attempts/cooldown/pass state), scoring, shuffling | `src/lib/quizzes/` |
| Certificate render | `{{merge_field}}` template hydration — pure function | `src/lib/certificates/render.ts` |
| Email | `sendEmail` via nodemailer SMTP; rendered templates per event | `src/lib/email/` |
| Supabase clients | Three clients: browser, server (SSR cookies), admin (service role) | `src/lib/supabase/` |

## Pattern Overview

**Overall:** Next.js App Router — React Server Components with co-located server actions. No separate API layer; data access happens directly in server components and `"use server"` action files.

**Key Characteristics:**
- Route groups `(auth)` and `(dashboard)` share no layouts with each other; `(dashboard)` owns the shell
- Every admin mutation goes through a server action that calls `requireAdmin()` before touching Supabase
- Client components are leaf nodes only (forms, interactive runners, nav); all data fetching stays server-side
- Supabase RLS is the second auth layer; the service-role client (`admin.ts`) bypasses it only for invite wiring
- Progress, lesson completion, and certificate issuance are driven by Postgres triggers in the DB, not application code

## Layers

**Middleware Layer:**
- Purpose: Refresh Supabase session cookie; redirect unauthenticated requests to `/login?next=<path>`
- Location: `src/middleware.ts` delegates to `src/lib/supabase/middleware.ts`
- Depends on: `@supabase/ssr` `createServerClient`
- Used by: Every request except static assets and public routes (`/login`, `/auth/*`, `/forgot-password`)

**Route Group: (auth):**
- Purpose: Login and forgot-password pages — no shell, no auth requirement
- Location: `src/app/(auth)/`
- Contains: `login/page.tsx`, `login/actions.ts`, `forgot-password/page.tsx`, `forgot-password/actions.ts`
- Depends on: `src/lib/supabase/server.ts`

**Route Group: (dashboard):**
- Purpose: All authenticated pages — learner and admin — wrapped in a persistent shell
- Location: `src/app/(dashboard)/`
- Layout: `src/app/(dashboard)/layout.tsx` — resolves user, checks `system_role`, counts pending submissions
- Sub-groups: learner routes (`/dashboard`, `/courses`, `/lessons`, `/certificates`, `/profile`); admin routes (`/admin/**`)

**Admin Sub-layout:**
- Purpose: Hard `requireAdmin()` gate; no separate UI shell (sidebar is in the parent dashboard layout)
- Location: `src/app/(dashboard)/admin/layout.tsx`
- Depends on: `src/lib/auth/guard.ts`

**API Routes:**
- Purpose: OAuth/magic-link callback, sign-out, password set
- Location: `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`, `src/app/auth/set-password/`
- Callback applies invite token: writes `system_role` + `user_role_groups` via admin client

**Business Logic (lib):**
- Purpose: Pure functions and domain utilities with unit test coverage
- Location: `src/lib/`
- Sub-modules: `auth/`, `certificates/`, `content-blocks/`, `courses/`, `email/`, `invites/`, `programs/`, `quizzes/`, `supabase/`
- Depends on: nothing app-specific; imported by both server components and actions

**Shared Components:**
- Purpose: UI primitives (shadcn/ui) + domain-specific renderers
- Location: `src/components/`
- Key files: `content-blocks.tsx`, `video-block-player.tsx`, `file-upload.tsx`
- `src/components/ui/` — generated shadcn primitives; treat as read-only

## Data Flow

### Learner Lesson View

1. Request hits `src/middleware.ts` — session refreshed, unauthenticated requests redirected
2. `src/app/(dashboard)/layout.tsx` — fetches user + profile, determines `isAdmin`, renders shell
3. `src/app/(dashboard)/lessons/[lessonId]/page.tsx` — fetches lesson, checks `fn_lesson_is_unlocked` RPC, fetches content blocks
4. `enrichBlocksWithSignedUrls` (`src/lib/content-blocks/sign-urls.ts`) — bulk-signs storage paths (1 hr TTL)
5. `ContentBlockRenderer` (`src/components/content-blocks.tsx`) — switch-dispatches blocks to sub-renderers
6. `MarkCompleteButton` calls `markLessonComplete` server action (`src/app/(dashboard)/lessons/[lessonId]/actions.ts`) — upserts `user_block_progress`; DB trigger materialises `user_lesson_completions` and runs certificate checks
7. `revalidatePath` flushes RSC cache for lesson and dashboard

### Quiz Submission

1. Learner page (`src/app/(dashboard)/lessons/[lessonId]/page.tsx`) fetches quiz + prior attempts, calls `computeQuizEligibility` (`src/lib/quizzes/attempts.ts`) to determine gate state
2. `QuizRunner` (client component, `quiz-runner.tsx`) collects answers
3. `submitQuizAttempt` server action (`quiz-actions.ts`) — re-checks eligibility server-side, fetches questions with `is_correct`, calls `scoreQuizAttempt` (`src/lib/quizzes/score.ts`), inserts `user_quiz_attempts`
4. `revalidatePath` flushes lesson + dashboard

### Assignment Submission

1. `AssignmentRunner` (client component) — text/URL/file-upload UI
2. `submitAssignment` server action (`assignment-actions.ts`) — validates, inserts `assignment_submissions` with `status: "submitted"`, notifies all admin emails via `sendEmail`
3. Admin reviews at `src/app/(dashboard)/admin/submissions/page.tsx`; `approveSubmission` / `requestRevision` actions (`admin/submissions/actions.ts`) update status and notify learner

### Certificate Flow

1. DB trigger fires when `user_lesson_completions` reaches 100% of required lessons for a course/program
2. `certificates` row inserted by Postgres trigger — no application code involved
3. Learner views certificate at `src/app/(dashboard)/certificates/course/[certId]/page.tsx`
4. Page fetches certificate + template, calls `renderCertificateHtml` (`src/lib/certificates/render.ts`) to hydrate `{{merge_field}}` placeholders
5. Browser `window.print()` triggered by `PrintButton` (client component)

### Invite / Onboarding Flow

1. Admin calls `inviteUser` action (`admin/users/actions.ts`) — inserts `invites` row with token, calls Supabase `admin.auth.admin.inviteUserByEmail` with `redirectTo` containing `invite_token`
2. Learner clicks email link; Supabase redirects to `/auth/callback?code=...&invite_token=...`
3. Callback (`src/app/auth/callback/route.ts`) exchanges code for session, calls `applyInvite` via admin client — writes `system_role` + `user_role_groups`, marks invite `accepted_at`
4. Redirects to `/auth/set-password` for first-time password set

**State Management:**
- No client-side global state store. Server state is Supabase Postgres, surfaced via RSC on every navigation.
- Client state is local React state within interactive components (quiz runner, blocks editor). Mutations always go through server actions with `revalidatePath`.

## Key Abstractions

**`ContentBlock` / `ContentBlockRenderer`:**
- Purpose: Uniform rendering of typed lesson content (10 block types)
- File: `src/components/content-blocks.tsx`
- Pattern: Switch on `block_type`; each branch is a private function component. Storage blocks get `signed_url` injected by `enrichBlocksWithSignedUrls` before reaching renderer.

**Shape functions (`shapeCourseResponse`, `shapeProgramsResponse`):**
- Purpose: Normalise PostgREST FK-join responses — handle both scalar and array shapes — into typed domain objects
- Files: `src/lib/courses/shape.ts`, `src/lib/programs/shape.ts`
- Pattern: Pure functions imported by server components; tested in `.test.ts` pairs

**`ActionResult` / discriminated union return types:**
- Purpose: Typed server action responses — `{ ok: true } | { ok: false; error: string }`
- Pattern: Every action returns a discriminated union. Client components check `.ok` and show toast on error.

**Supabase client trinity:**
- `src/lib/supabase/server.ts` — SSR client (reads cookies); used in server components and actions
- `src/lib/supabase/client.ts` — browser client (used by client components that need direct Supabase access)
- `src/lib/supabase/admin.ts` — service-role client; bypasses RLS; only called after `requireAdmin()` is confirmed or in callback routes

## Entry Points

**Root redirect:**
- Location: `src/app/page.tsx`
- Triggers: Any visit to `/`
- Responsibilities: Immediate `redirect("/dashboard")`

**Root layout:**
- Location: `src/app/layout.tsx`
- Responsibilities: HTML shell, Google fonts, `TooltipProvider`, `Toaster`

**Middleware:**
- Location: `src/middleware.ts`
- Triggers: Every request (matcher excludes static + image assets)
- Responsibilities: Session refresh, unauthenticated redirect with `?next=` bounce param

**Auth callback route:**
- Location: `src/app/auth/callback/route.ts`
- Triggers: Supabase magic-link / invite redirect
- Responsibilities: Exchange code for session, apply invite token, route to set-password or `next`

## Architectural Constraints

- **Threading:** Next.js serverless edge/node; no shared in-process state between requests. Each server component and action creates a fresh Supabase client from cookies.
- **Global state:** None. No module-level singletons except stateless utility functions.
- **Circular imports:** None detected. `lib/` never imports from `app/`; `app/` imports from `lib/` only.
- **RLS boundary:** Learner session client enforces row-level access. Admin client (`admin.ts`) bypasses RLS — must only be instantiated after `requireAdmin()` verification or in trusted route handlers.
- **Correct answer data:** Quiz `is_correct` field is never selected in learner-facing page queries. Only `submitQuizAttempt` fetches it server-side for scoring.

## Anti-Patterns

### Fetching `is_correct` in learner components

**What happens:** Selecting `answer_options(is_correct)` in learner page server components or passing it to `QuizRunner`
**Why it's wrong:** Exposes correct answers to the browser in RSC payload; learners can read them from devtools
**Do this instead:** Keep `is_correct` fetches exclusively inside `submitQuizAttempt` in `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts`

### Using the admin client in a server component rendered for learners

**What happens:** Calling `createAdminClient()` from a page or layout without first verifying admin role
**Why it's wrong:** Bypasses RLS; exposes all rows regardless of user identity
**Do this instead:** Only call `createAdminClient()` after `await requireAdmin()` has returned, or inside `src/app/auth/callback/route.ts` which runs outside any user session

### Creating a server action without `requireAdmin()` for admin mutations

**What happens:** An action that mutates admin-only tables (lessons, blocks, programs, users) that only relies on the route being under `/admin/`
**Why it's wrong:** Route-level guard in the layout (`admin/layout.tsx`) doesn't protect direct action invocations from malicious clients
**Do this instead:** Call `await requireAdmin()` as the first line of every admin server action, as done in `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts`

## Error Handling

**Strategy:** Discriminated union return values from server actions. Pages use `notFound()` for missing records and render inline error UI for query failures.

**Patterns:**
- Server actions return `{ ok: true } | { ok: false; error: string }` — client components display the error via `sonner` toast
- Server components call `notFound()` when a record lookup returns null (triggers Next.js 404)
- Email send failures are fire-and-forget — SMTP errors are logged but never surface to the user
- Admin client instantiation (`createAdminClient`) throws if env vars are missing; actions catch and return `{ ok: false, error }` with actionable message

## Cross-Cutting Concerns

**Logging:** No structured logger. `console.error` is used sparingly; email failures are silent no-ops.
**Validation:** Input parsing in `src/lib/invites/validate.ts`, `src/lib/courses/validate.ts`, `src/lib/programs/validate.ts` — plain TypeScript functions, no schema library.
**Authentication:** Two-layer — middleware redirects unauthenticated requests; `requireAdmin()` in server actions/admin layout gates role.

---

*Architecture analysis: 2026-04-30*
