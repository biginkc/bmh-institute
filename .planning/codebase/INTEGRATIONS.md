# External Integrations

**Analysis Date:** 2026-04-30

## APIs & External Services

**Authentication & Backend Platform:**
- Supabase - Postgres database, Auth, Storage, and RLS
  - SDK/Client: `@supabase/ssr` (server/middleware) and `@supabase/supabase-js` (admin)
  - Project ref: `dhvfsyteqsxagokoerrx`
  - Three client modes:
    - Browser client: `src/lib/supabase/client.ts` — `createBrowserClient` with anon key
    - Server client: `src/lib/supabase/server.ts` — `createServerClient` with cookie store
    - Admin client: `src/lib/supabase/admin.ts` — `createClient` with service-role key; bypasses RLS
  - Auth env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Admin env var: `SUPABASE_SERVICE_ROLE_KEY`

**Email:**
- Google Workspace SMTP via Nodemailer — transactional email (invites, enrollment notifications, submission reviews)
  - SDK/Client: `nodemailer` 8.0.5
  - Transport: `src/lib/email/send.ts`
  - Auth env vars: `SMTP_HOST` (`smtp.gmail.com`), `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`
  - Sender config: `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
  - Gracefully no-ops when SMTP vars are absent or set to `replace_me`
  - Comment in `src/lib/email/send.ts` notes SendGrid/AWS SES as drop-in swap targets (only the transporter construction changes)

**Fonts:**
- Google Fonts (Next.js `next/font/google`) — Geist Sans and Geist Mono loaded in `src/app/layout.tsx`

**Deployment:**
- Vercel — hosting; project config at `.vercel/project.json`
  - Project ID: `prj_dqTvXS2iRS4GyuWuGRiLoMdHhu6m`
  - Production URL: `https://sandra-university.vercel.app` (also served at `university.bmhgroup.com`)

## Data Storage

**Databases:**
- Supabase Postgres (hosted)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`
  - Client: `@supabase/ssr` / `@supabase/supabase-js` (no ORM; raw query builder)
  - Schema managed via numbered migrations: `supabase/migrations/001_initial_schema.sql` through `007_storage_submissions_bucket.sql`
  - RLS enabled on every table; policies in `supabase/migrations/003_rls_policies.sql`
  - Key tables: `profiles`, `programs`, `courses`, `modules`, `lessons`, `role_groups`, `user_role_groups`, `invites`, `certificate_templates`
  - Extensions: `pgcrypto` (UUID generation via `gen_random_uuid()`)
  - Functions/triggers: `set_updated_at()` trigger on all tables; `is_admin()` security-definer function used in RLS policies

**File Storage:**
- Supabase Storage (S3-compatible, private buckets)
  - Two buckets defined in migrations:
    - `content` bucket (`supabase/migrations/006_storage_content_bucket.sql`): Admin-write, authenticated-read; 2 GB file size limit; accepts video/mp4, video/webm, audio/mpeg, application/pdf, image/*, and more
    - `submissions` bucket (`supabase/migrations/007_storage_submissions_bucket.sql`): Learner self-write scoped to `{user_id}/...` prefix; 500 MB limit; admin read-all
  - Signed URLs generated server-side in `src/lib/content-blocks/sign-urls.ts` with 1-hour TTL; bulk-signed to avoid N round-trips

**Caching:**
- None — no Redis or external cache; Next.js default fetch cache only

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in)
  - Implementation: cookie-based session via `@supabase/ssr`; session refresh handled by `src/lib/supabase/middleware.ts` (called from `src/middleware.ts`)
  - Flows supported: email+password login, invite via magic link (`inviteUserByEmail`), password reset (`resetPasswordForEmail`), OAuth callback at `src/app/auth/callback/route.ts`
  - Invite flow: Admin creates invite row in `invites` table with a `token`; Supabase sends magic link with `redirect_to` containing `invite_token`; callback at `src/app/auth/callback/route.ts` applies role/group from invite record via admin client
  - Admin detection: `ADMIN_EMAILS` env var (comma-separated); logic in `src/lib/auth/allowlist.ts`
  - Route protection: middleware redirects unauthenticated users to `/login?next=<original_path>`; public paths: `/login`, `/forgot-password`, `/reset-password`, `/invite`, `/auth/**`, `/api/webhooks/**`, `/api/cron/**`
  - System roles: `owner`, `admin`, `learner` (stored on `profiles.system_role`)
  - Admin API methods used: `auth.admin.inviteUserByEmail`, `auth.admin.updateUserById`, `auth.admin.deleteUser` — all via `createAdminClient()` in `src/lib/supabase/admin.ts`

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry or equivalent configured

**Logs:**
- `console.error` / `console.warn` in server actions and route handlers; no structured logging service

## CI/CD & Deployment

**Hosting:**
- Vercel (Hobby plan)
  - Production: auto-deploys from `main` branch
  - Custom domain: `university.bmhgroup.com`
  - Server Action allowed origins configured in `next.config.ts`

**CI Pipeline:**
- None configured — no GitHub Actions or similar; Husky pre-commit hook (`npm run verify`) is the only automated gate

## Environment Configuration

**Required env vars (production):**
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key (public)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key; server-only; bypasses RLS
- `NEXT_PUBLIC_APP_URL` — App base URL used in email links
- `SMTP_HOST` — SMTP server hostname (`smtp.gmail.com`)
- `SMTP_PORT` — SMTP port (`465` for implicit TLS)
- `SMTP_USER` — SMTP username / sender address
- `SMTP_PASS` — SMTP app password (Google Workspace app password)
- `SMTP_FROM_EMAIL` — From address in sent emails
- `SMTP_FROM_NAME` — From display name (defaults to `Sandra University`)
- `ADMIN_EMAILS` — Comma-separated admin email allowlist (defaults to `jarrad@bmhgroup.com`)

**Secrets location:**
- Vercel environment variables (production)
- `.env.local` (local dev, not committed)
- `.env.test.local` (test credentials, not committed)
- `.env.example` documents all required vars with placeholder values

## Webhooks & Callbacks

**Incoming:**
- `/auth/callback` (GET) — Supabase Auth callback handler; processes invite tokens, magic links, and password recovery flows (`src/app/auth/callback/route.ts`)
- `/auth/signout` (POST) — Supabase sign-out route handler (`src/app/auth/signout/route.ts`)
- Middleware config notes `/api/webhooks/**` and `/api/cron/**` as public paths, but no handlers for these routes currently exist in `src/app/`

**Outgoing:**
- Transactional emails sent via Nodemailer SMTP on: user invite, enrollment confirmation, submission review notification
- Email templates: `src/lib/email/enrollment.ts`, `src/lib/email/new-submission.ts`, `src/lib/email/review.ts`

---

*Integration audit: 2026-04-30*
