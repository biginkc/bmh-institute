# Technology Stack

**Analysis Date:** 2026-04-30

## Languages

**Primary:**
- TypeScript 5.x - All application code in `src/`
- SQL (PostgreSQL) - Supabase migrations in `supabase/migrations/`

**Secondary:**
- JavaScript - Config files (`eslint.config.mjs`, `postcss.config.mjs`)

## Runtime

**Environment:**
- Node.js v25.8.2 (local dev)

**Package Manager:**
- npm 11.11.1
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.2.4 - Full-stack React framework; App Router with Server Components, Server Actions, and Route Handlers
- React 19.2.4 - UI rendering
- React DOM 19.2.4 - DOM bindings

**Testing:**
- Vitest 4.1.5 - Unit and integration test runner; config at `vitest.config.ts` and `vitest.integration.config.ts`
- Playwright 1.59.1 - E2E tests; configs at `playwright.config.ts` (local) and `playwright.prod.config.ts` (production smoke)

**Build/Dev:**
- Tailwind CSS 4.x - Utility-first styling; config embedded in `src/app/globals.css` via CSS variables
- PostCSS via `@tailwindcss/postcss` - Handles Tailwind compilation; config at `postcss.config.mjs`
- Husky 9.1.7 - Git hooks; pre-commit hook at `.husky/pre-commit` runs `npm run verify`
- ESLint 9.x - Linting; config at `eslint.config.mjs` using `eslint-config-next` with Core Web Vitals and TypeScript rules

## Key Dependencies

**Critical:**
- `@supabase/ssr` 0.10.2 - Server-side Supabase client with cookie-based session management; used in `src/lib/supabase/server.ts` and `src/lib/supabase/middleware.ts`
- `@supabase/supabase-js` 2.104.0 - Base Supabase client; used directly in `src/lib/supabase/admin.ts` for service-role client
- `nodemailer` 8.0.5 - Transactional email via SMTP; abstracted in `src/lib/email/send.ts`

**UI:**
- `@base-ui/react` 1.4.1 - Headless UI primitives (base for shadcn components)
- `shadcn` 4.4.0 - Component library scaffolding; config at `components.json` (style: `base-nova`)
- `lucide-react` 1.8.0 - Icon library; configured as shadcn icon library
- `class-variance-authority` 0.7.1 - Component variant management
- `clsx` 2.1.1 - Conditional class merging
- `tailwind-merge` 3.5.0 - Tailwind class conflict resolution
- `tw-animate-css` 1.4.0 - CSS animation utilities for Tailwind
- `sonner` 2.0.7 - Toast notifications; rendered at app root in `src/app/layout.tsx`
- `next-themes` 0.4.6 - Theme support (used within sonner component at `src/components/ui/sonner.tsx`)

**Drag and Drop:**
- `@dnd-kit/core` 6.3.1 - Drag-and-drop primitives (declared in package.json; available for use)
- `@dnd-kit/sortable` 10.0.0 - Sortable list utilities
- `@dnd-kit/utilities` 3.2.2 - DnD helper utilities

**Utilities:**
- `date-fns` 4.1.0 - Date formatting and manipulation

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2017
- Strict mode enabled
- Path aliases: `@/*` maps to `./src/*`, `@tests/*` maps to `./tests/*`
- Module resolution: `bundler`

**Next.js:**
- Config: `next.config.ts`
- Server Actions enabled with `allowedOrigins`: `university.bmhgroup.com` and `localhost:3100`
- Server Action body size limit: 25MB (supports file uploads)

**shadcn:**
- Config: `components.json`
- Style: `base-nova`
- RSC enabled
- CSS variables for theming
- Base color: neutral
- Components path alias: `@/components`
- UI path alias: `@/components/ui`

**Environment:**
- Example: `.env.example` (documents all required vars)
- Local: `.env.local` (not committed)
- Test: `.env.test.local` (not committed; loaded by custom parser in test configs)
- Required vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
  - `ADMIN_EMAILS`
- Test-only vars (in `.env.test.local`):
  - `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`
  - `E2E_PROD_BASE_URL`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`

**Build:**
- `next build` produces standard Next.js output
- `npm run verify` (typecheck + unit tests) gates pre-commit via Husky

## Platform Requirements

**Development:**
- Node.js 25.x
- npm 11.x
- Port 3100 for `npm run dev`
- Port 3200 for Playwright E2E local dev server

**Production:**
- Vercel (Hobby plan) — project: `sandra-university`, org: `team_uELniQVfObNI03AFG17L8yEI`
- Deployed to: `university.bmhgroup.com` (custom domain)
- Supabase project: `sandra-university` (ref `dhvfsyteqsxagokoerrx`)

---

*Stack analysis: 2026-04-30*
