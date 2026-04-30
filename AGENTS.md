<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BMH Institute — agent notes

## Project identity (read this first)

This repo is **BMH Institute**, BMH Group's internal training platform. Renamed from Sandra University on 2026-04-30; the working directory may still say `Sandra University/` while paths catch up.

**This repo is NOT Sandra Practice.** Sandra Practice is a separate planned standalone app (`../Sandra Practice/`, `sandra-practice-planning/` is its parked seed) that will run AI voice role plays and eventually embed into BMH Institute lessons via the contract in `role-play-embed-contract.md`.

If a request describes voice runtime, persona conversations, mic input, Deepgram/Claude/ElevenLabs live integration, scenario authoring, scoring, transcripts, attempts library, or recording playback — **that work belongs in Sandra Practice, not here**. Surface the mismatch and confirm direction before changing this repo.

BMH Institute mirrors Sandra CRM's stack and conventions but runs as an independent Next.js app against its own Supabase project (label `bmh-institute`, ref `dhvfsyteqsxagokoerrx`). Schema, UI, and auth are independent of the CRM; visual language and technical patterns are intentionally shared.

## Development workflow

**TDD is the standard, with up-front test inventory review.** For every feature, bug fix, or behavioral change:

1. Enumerate the full test inventory that defines "done" — name every test, its scope (unit / integration / e2e), and what it asserts.
2. Present the inventory and wait for explicit approval before writing tests or production code.
3. Write the failing tests first, in their own commit.
4. Implement the minimum code to make the suite pass.
5. Refactor with tests green.

Don't mark work done without a covering test. Don't compress steps 1 and 2 into "I'll just write the tests as I go" — the inventory is the reviewable contract on what the feature must satisfy.

- `npm run dev` — next dev on port 3100
- `npm run test` — vitest unit suite
- `npm run test:integration` — vitest against a real Supabase (populate `.env.test.local`)
- `npm run test:e2e` — playwright
- `npm run verify` — typecheck + unit tests; gates the husky pre-commit hook

## Supabase

- Production project: label `bmh-institute` (ref `dhvfsyteqsxagokoerrx`; ref is permanent)
- Migrations: `supabase/migrations/NNN_name.sql` applied in order
- RLS enabled on every table; learner reads scoped by role groups and program/course access
- Seeds are dev-only; promote your profile to `system_role = 'owner'` manually after first sign-in

## Writing style

- No em dashes.
- Minimal commas, dashes, hyphens.
- No bold headers or Roman numeral headers in docs.
- Company name is "BMH Group" (never "BMH Group KC").
- Quiz answer options: no lettering, randomized per attempt.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**BMH Institute**

BMH Institute is BMH Group's internal training platform for VAs (mostly Philippines, English often a second language, async, sessions in hours not minutes). Replaces a Thinkific subscription. Built as a Next.js App Router app on Supabase (auth, Postgres, RLS, Storage), self-hosted on Vercel, with Google Workspace SMTP for transactional email. Renamed from Sandra University on 2026-04-30; the Supabase project ref is unchanged.

**Core Value:** A VA can sign in via an admin invite, work through assigned programs and courses on their own time, take quizzes and submit assignments without supervision, and receive a certificate when they finish. Admins can author content, manage learners, review submissions, and see who is making progress without leaving the platform.

### Constraints

- **Tech stack**: Next.js 16 App Router on Node 22+, React 19, Tailwind 4, shadcn v4, @supabase/ssr — locked
- **Database**: Supabase project ref `dhvfsyteqsxagokoerrx` (label `bmh-institute`) — RLS on every table is non-negotiable
- **Email**: Google Workspace SMTP via nodemailer — no alternate providers
- **Hosting**: Vercel Hobby plan — Password Protection and Automation Bypass are Pro-only and unavailable
- **Testing**: Vitest unit + integration; Playwright e2e. **Test-first TDD with up-front inventory review** — for every change, the full test inventory is enumerated and approved by Jarrad before any tests or code are written; failing tests land in their own commit before the implementation commit. `npm run verify` (typecheck + unit) gates the husky pre-commit hook
- **Writing style**: No em dashes, minimal commas/dashes, no bold or Roman numeral headers, company is "BMH Group" not "BMH Group KC"
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.x - All application code in `src/`
- SQL (PostgreSQL) - Supabase migrations in `supabase/migrations/`
- JavaScript - Config files (`eslint.config.mjs`, `postcss.config.mjs`)
## Runtime
- Node.js v25.8.2 (local dev)
- npm 11.11.1
- Lockfile: `package-lock.json` present
## Frameworks
- Next.js 16.2.4 - Full-stack React framework; App Router with Server Components, Server Actions, and Route Handlers
- React 19.2.4 - UI rendering
- React DOM 19.2.4 - DOM bindings
- Vitest 4.1.5 - Unit and integration test runner; config at `vitest.config.ts` and `vitest.integration.config.ts`
- Playwright 1.59.1 - E2E tests; configs at `playwright.config.ts` (local) and `playwright.prod.config.ts` (production smoke)
- Tailwind CSS 4.x - Utility-first styling; config embedded in `src/app/globals.css` via CSS variables
- PostCSS via `@tailwindcss/postcss` - Handles Tailwind compilation; config at `postcss.config.mjs`
- Husky 9.1.7 - Git hooks; pre-commit hook at `.husky/pre-commit` runs `npm run verify`
- ESLint 9.x - Linting; config at `eslint.config.mjs` using `eslint-config-next` with Core Web Vitals and TypeScript rules
## Key Dependencies
- `@supabase/ssr` 0.10.2 - Server-side Supabase client with cookie-based session management; used in `src/lib/supabase/server.ts` and `src/lib/supabase/middleware.ts`
- `@supabase/supabase-js` 2.104.0 - Base Supabase client; used directly in `src/lib/supabase/admin.ts` for service-role client
- `nodemailer` 8.0.5 - Transactional email via SMTP; abstracted in `src/lib/email/send.ts`
- `@base-ui/react` 1.4.1 - Headless UI primitives (base for shadcn components)
- `shadcn` 4.4.0 - Component library scaffolding; config at `components.json` (style: `base-nova`)
- `lucide-react` 1.8.0 - Icon library; configured as shadcn icon library
- `class-variance-authority` 0.7.1 - Component variant management
- `clsx` 2.1.1 - Conditional class merging
- `tailwind-merge` 3.5.0 - Tailwind class conflict resolution
- `tw-animate-css` 1.4.0 - CSS animation utilities for Tailwind
- `sonner` 2.0.7 - Toast notifications; rendered at app root in `src/app/layout.tsx`
- `next-themes` 0.4.6 - Theme support (used within sonner component at `src/components/ui/sonner.tsx`)
- `@dnd-kit/core` 6.3.1 - Drag-and-drop primitives (declared in package.json; available for use)
- `@dnd-kit/sortable` 10.0.0 - Sortable list utilities
- `@dnd-kit/utilities` 3.2.2 - DnD helper utilities
- `date-fns` 4.1.0 - Date formatting and manipulation
## Configuration
- Config: `tsconfig.json`
- Target: ES2017
- Strict mode enabled
- Path aliases: `@/*` maps to `./src/*`, `@tests/*` maps to `./tests/*`
- Module resolution: `bundler`
- Config: `next.config.ts`
- Server Actions enabled with `allowedOrigins`: `university.bmhgroup.com` and `localhost:3100`
- Server Action body size limit: 25MB (supports file uploads)
- Config: `components.json`
- Style: `base-nova`
- RSC enabled
- CSS variables for theming
- Base color: neutral
- Components path alias: `@/components`
- UI path alias: `@/components/ui`
- Example: `.env.example` (documents all required vars)
- Local: `.env.local` (not committed)
- Test: `.env.test.local` (not committed; loaded by custom parser in test configs)
- Required vars:
- Test-only vars (in `.env.test.local`):
- `next build` produces standard Next.js output
- `npm run verify` (typecheck + unit tests) gates pre-commit via Husky
## Platform Requirements
- Node.js 25.x
- npm 11.x
- Port 3100 for `npm run dev`
- Port 3200 for Playwright E2E local dev server
- Vercel (Hobby plan) — project: `bmh-institute` (renamed from `sandra-university` 2026-04-30), org: `team_uELniQVfObNI03AFG17L8yEI`
- Deployed to: `university.bmhgroup.com` (custom domain — domain not yet renamed)
- Supabase project: label `bmh-institute` (ref `dhvfsyteqsxagokoerrx`; ref is permanent)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all source files: `sanitize-next.ts`, `new-submission.ts`, `role-groups-editor.tsx`
- Test files co-located alongside the file under test with `.test.ts` suffix: `score.ts` / `score.test.ts`
- Integration tests use `.integration.test.ts` suffix (excluded from the unit suite)
- Server action files named `actions.ts` in the same directory as their page
- Form components named `[noun]-form.tsx`: `program-form.tsx`, `course-form.tsx`, `invite-form.tsx`
- Page files are always `page.tsx`; layout files are always `layout.tsx`
- camelCase for all functions: `scoreQuizAttempt`, `parseProgramInput`, `shapeProgramsResponse`
- Parser functions prefixed `parse`: `parseProgramInput`, `parseCourseInput`, `parseInviteInput`
- Shaper functions prefixed `shape`: `shapeProgramsResponse`, `shapeCourseResponse`
- Guard/auth functions prefixed with intent: `requireAdmin`, `getAuthedProfile`, `isAdminEmail`
- Email render functions prefixed `render`: `renderNewSubmissionEmail`, `renderCertificateHtml`
- Client factories named `createClient` (scoped by module): `createClient` in `server.ts`, `createAdminClient` in `admin.ts`
- camelCase: `progressByCourse`, `requiredLessonsByCourse`, `attemptsLeft`
- Boolean variables use descriptive names without `is` prefix when clear from context: `hasPass`, `pending`
- Constants at module scope in SCREAMING_SNAKE_CASE: `MAX_TITLE_LEN`, `MAX_DESCRIPTION_LEN`
- PascalCase for all type and interface names: `ProgramInput`, `AuthedProfile`, `ScoringQuestion`
- Discriminated unions use a literal `ok` or `state` field for narrowing: `{ ok: true; value: T } | { ok: false; errors: ... }`, `{ state: "open" ... } | { state: "cooldown" ... }`
- Generic type alias `ParseResult<T>` is redefined per domain module (no shared import) in `src/lib/programs/validate.ts`, `src/lib/courses/validate.ts`, `src/lib/invites/validate.ts`
- `FormState` exported from `actions.ts` and reused by the paired form component
## Code Style
- TypeScript strict mode enabled (`"strict": true` in `tsconfig.json`)
- Target: ES2017; module resolution: bundler
- No explicit Prettier config detected — ESLint handles style through `eslint-config-next`
- ESLint 9 flat config via `eslint.config.mjs`
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
## Import Organization
- `@/*` maps to `src/*`
- `@tests/*` maps to `tests/*` (integration test helpers)
## Error Handling
- Comment the intent explicitly: `// Fire-and-forget — an SMTP failure shouldn't block the invite`
## Logging
## Comments
- Document rules, not types: see `scoreQuizAttempt` in `src/lib/quizzes/score.ts`
- Security warnings on sensitive clients: see `createAdminClient` in `src/lib/supabase/admin.ts`
- Implementation rationale for non-obvious decisions: inline `//` comments (`// Defense in depth: re-check eligibility server-side`)
## Module Design
- Named exports only — no default exports from lib modules
- `export default` used only for Next.js page and layout components (framework requirement)
- Types exported alongside the functions that use them from the same file
## Function Design
## React / Next.js Conventions
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Route groups `(auth)` and `(dashboard)` share no layouts with each other; `(dashboard)` owns the shell
- Every admin mutation goes through a server action that calls `requireAdmin()` before touching Supabase
- Client components are leaf nodes only (forms, interactive runners, nav); all data fetching stays server-side
- Supabase RLS is the second auth layer; the service-role client (`admin.ts`) bypasses it only for invite wiring
- Progress, lesson completion, and certificate issuance are driven by Postgres triggers in the DB, not application code
## Layers
- Purpose: Refresh Supabase session cookie; redirect unauthenticated requests to `/login?next=<path>`
- Location: `src/middleware.ts` delegates to `src/lib/supabase/middleware.ts`
- Depends on: `@supabase/ssr` `createServerClient`
- Used by: Every request except static assets and public routes (`/login`, `/auth/*`, `/forgot-password`)
- Purpose: Login and forgot-password pages — no shell, no auth requirement
- Location: `src/app/(auth)/`
- Contains: `login/page.tsx`, `login/actions.ts`, `forgot-password/page.tsx`, `forgot-password/actions.ts`
- Depends on: `src/lib/supabase/server.ts`
- Purpose: All authenticated pages — learner and admin — wrapped in a persistent shell
- Location: `src/app/(dashboard)/`
- Layout: `src/app/(dashboard)/layout.tsx` — resolves user, checks `system_role`, counts pending submissions
- Sub-groups: learner routes (`/dashboard`, `/courses`, `/lessons`, `/certificates`, `/profile`); admin routes (`/admin/**`)
- Purpose: Hard `requireAdmin()` gate; no separate UI shell (sidebar is in the parent dashboard layout)
- Location: `src/app/(dashboard)/admin/layout.tsx`
- Depends on: `src/lib/auth/guard.ts`
- Purpose: OAuth/magic-link callback, sign-out, password set
- Location: `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`, `src/app/auth/set-password/`
- Callback applies invite token: writes `system_role` + `user_role_groups` via admin client
- Purpose: Pure functions and domain utilities with unit test coverage
- Location: `src/lib/`
- Sub-modules: `auth/`, `certificates/`, `content-blocks/`, `courses/`, `email/`, `invites/`, `programs/`, `quizzes/`, `supabase/`
- Depends on: nothing app-specific; imported by both server components and actions
- Purpose: UI primitives (shadcn/ui) + domain-specific renderers
- Location: `src/components/`
- Key files: `content-blocks.tsx`, `video-block-player.tsx`, `file-upload.tsx`
- `src/components/ui/` — generated shadcn primitives; treat as read-only
## Data Flow
### Learner Lesson View
### Quiz Submission
### Assignment Submission
### Certificate Flow
### Invite / Onboarding Flow
- No client-side global state store. Server state is Supabase Postgres, surfaced via RSC on every navigation.
- Client state is local React state within interactive components (quiz runner, blocks editor). Mutations always go through server actions with `revalidatePath`.
## Key Abstractions
- Purpose: Uniform rendering of typed lesson content (10 block types)
- File: `src/components/content-blocks.tsx`
- Pattern: Switch on `block_type`; each branch is a private function component. Storage blocks get `signed_url` injected by `enrichBlocksWithSignedUrls` before reaching renderer.
- Purpose: Normalise PostgREST FK-join responses — handle both scalar and array shapes — into typed domain objects
- Files: `src/lib/courses/shape.ts`, `src/lib/programs/shape.ts`
- Pattern: Pure functions imported by server components; tested in `.test.ts` pairs
- Purpose: Typed server action responses — `{ ok: true } | { ok: false; error: string }`
- Pattern: Every action returns a discriminated union. Client components check `.ok` and show toast on error.
- `src/lib/supabase/server.ts` — SSR client (reads cookies); used in server components and actions
- `src/lib/supabase/client.ts` — browser client (used by client components that need direct Supabase access)
- `src/lib/supabase/admin.ts` — service-role client; bypasses RLS; only called after `requireAdmin()` is confirmed or in callback routes
## Entry Points
- Location: `src/app/page.tsx`
- Triggers: Any visit to `/`
- Responsibilities: Immediate `redirect("/dashboard")`
- Location: `src/app/layout.tsx`
- Responsibilities: HTML shell, Google fonts, `TooltipProvider`, `Toaster`
- Location: `src/middleware.ts`
- Triggers: Every request (matcher excludes static + image assets)
- Responsibilities: Session refresh, unauthenticated redirect with `?next=` bounce param
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
### Using the admin client in a server component rendered for learners
### Creating a server action without `requireAdmin()` for admin mutations
## Error Handling
- Server actions return `{ ok: true } | { ok: false; error: string }` — client components display the error via `sonner` toast
- Server components call `notFound()` when a record lookup returns null (triggers Next.js 404)
- Email send failures are fire-and-forget — SMTP errors are logged but never surface to the user
- Admin client instantiation (`createAdminClient`) throws if env vars are missing; actions catch and return `{ ok: false, error }` with actionable message
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
