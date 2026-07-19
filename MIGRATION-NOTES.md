# BMH Institute migration notes

This file captures details that should travel with BMH Institute when the standalone repo is moved into `bmh-platform/apps/bmh-institute/`.

## Current runtime and package manager

- App name: `bmh-institute`.
- Current local Node observed during this update: `v25.8.2`.
- GitHub Actions Node: `22` for main CI and production workflows. `db-migrate-test.yml` uses Node `24`.
- Package manager today: npm with `package-lock.json`.
- No `packageManager` field is currently set in `package.json`.
- `pnpm -v` on this machine is `9.15.0`, but this repo is not using pnpm yet.
- Framework: Next.js `16.2.4`.
- React: `19.2.4`.
- React DOM: `19.2.4`.
- TypeScript: `^5`.
- Supabase client packages: `@supabase/ssr ^0.10.2`, `@supabase/supabase-js ^2.104.0`.

## Monorepo alignment notes

- The platform monorepo target is `/Users/jarradhenry/Sites/BMH apps/`, GitHub repo `biginkc/bmh-platform`.
- Phase 1 migration should place this repo under `apps/bmh-institute/`.
- The platform plan uses pnpm 9 and Turborepo. This repo will need npm scripts adapted to pnpm filter commands after migration.
- The platform plan expects catalog pins for React, Next, Supabase client packages, and TypeScript.
- This repo is currently on Next.js `16.2.4`, while the migration note warns not to pin wildly away from Next `15.1`. Do not downgrade preemptively without a dedicated migration decision.
- This repo currently consumes `@sandra/tokens` as `github:biginkc/sandra-design-system#main`. That dependency is not a local app import, but the migration agent should decide whether it remains a GitHub dependency, becomes a platform package later, or is temporarily left alone. Do not replace it with a cross-app import.

## Required environment variables

Names only. Do not commit values.

### Runtime

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ROLE_PLAY_JWT_SECRET`
- `NEXT_PUBLIC_ROLE_PLAY_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `ADMIN_EMAILS`

### Local integration and Playwright E2E

- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_ANON_KEY`
- `TEST_SUPABASE_SERVICE_ROLE_KEY`
- `E2E_SEED_PASSWORD`
- `CLOSER_TEST_SUPABASE_URL`
- `CLOSER_TEST_SUPABASE_ANON_KEY`
- `CLOSER_TEST_SUPABASE_SERVICE_ROLE_KEY`

### Production smoke and production-readiness harnesses

- `E2E_PROD_BASE_URL`
- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`
- `PROD_SUPABASE_URL`
- `PROD_SUPABASE_ANON_KEY`
- `PROD_SUPABASE_SERVICE_ROLE_KEY`
- `PROD_READINESS_TEST_PASSWORD`
- `PROD_READINESS_EMAIL_INBOX`
- `PROD_READINESS_EMAIL_IMAP_HOST`
- `PROD_READINESS_EMAIL_IMAP_PORT`
- `PROD_READINESS_EMAIL_IMAP_SECURE`
- `PROD_READINESS_EMAIL_IMAP_USER`
- `PROD_READINESS_EMAIL_IMAP_PASS`
- `PROD_READINESS_EMAIL_MAILBOX`
- `PROD_READINESS_EMAIL_POLL_MS`
- `PROD_READINESS_EMAIL_TIMEOUT_MS`

### GitHub Actions secrets

- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_ANON_KEY`
- `TEST_SUPABASE_SERVICE_ROLE_KEY`
- `E2E_SEED_PASSWORD`
- `TEST_SUPABASE_DB_PASSWORD`
- `E2E_PROD_BASE_URL`
- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`
- `PROD_SUPABASE_URL`
- `PROD_SUPABASE_ANON_KEY`
- `PROD_SUPABASE_SERVICE_ROLE_KEY`
- `PROD_READINESS_TEST_PASSWORD`
- `PROD_READINESS_EMAIL_INBOX`
- `PROD_READINESS_EMAIL_IMAP_HOST`
- `PROD_READINESS_EMAIL_IMAP_PORT`
- `PROD_READINESS_EMAIL_IMAP_SECURE`
- `PROD_READINESS_EMAIL_IMAP_USER`
- `PROD_READINESS_EMAIL_IMAP_PASS`
- `PROD_READINESS_EMAIL_MAILBOX`
- `PROD_READINESS_EMAIL_POLL_MS`
- `PROD_READINESS_EMAIL_TIMEOUT_MS`

## Supabase

- Production Supabase project label: `bmh-institute`.
- Production project ref: `dhvfsyteqsxagokoerrx`.
- Durable non-production E2E/test project label: `bmh-institute-test`.
- Durable non-production E2E/test project ref: `jvaabkchkihkjllehmft`.
- Migrations live in `supabase/migrations/`.
- Current migrations run from `001_initial_schema.sql` through `013_role_play_blocks.sql`.
- No `supabase/functions/` directory exists today. No Supabase Edge Functions were found in this repo.
- Storage buckets are created through migrations for content and submissions.
- Local and CI seed scripts intentionally refuse the production ref for normal E2E fixture seeding.
- Production-readiness scripts intentionally allow disposable prefixed writes against production and clean them up.

## GitHub Actions and CI

- `.github/workflows/ci.yml`
  - Runs on PRs, pushes to `main`, and manual dispatch.
  - Uses npm and Node `22`.
  - Job `Verify`: `npm ci`, then `npm run verify`.
  - Job `Seeded Playwright E2E`: seeds test Supabase with `npm run seed:e2e`, then `npm run test:e2e`.
- `.github/workflows/db-migrate-test.yml`
  - Runs manually and on PRs touching Supabase migrations or the workflow itself.
  - Applies pending migrations to the test project ref `jvaabkchkihkjllehmft`.
  - Uses Supabase CLI and `TEST_SUPABASE_DB_PASSWORD`.
- `.github/workflows/production-readiness.yml`
  - Manual dispatch only.
  - Runs `npm run test:prod:readiness` against production using disposable prefixed data and email-link retrieval.
- `.github/workflows/production-pilot-dryrun.yml`
  - Manual dispatch plus weekly schedule at `17 13 * * 1`.
  - Runs `npm run test:prod:dryrun`.

## Scheduled jobs, webhooks, and route handlers

- Scheduled GitHub Action: `production-pilot-dryrun.yml`, weekly Monday at 13:17 UTC.
- Middleware allows unauthenticated paths under `/api/webhooks` and `/api/cron`, but no current route handlers exist under those paths.
- Existing route handlers:
  - `src/app/auth/callback/route.ts`
  - `src/app/auth/apply-invite/route.ts`
  - `src/app/auth/signout/route.ts`
  - `src/app/(dashboard)/admin/reports/pilot/export/route.ts`
- No Inngest endpoint exists today.
- No `/api/integrations/v1/*` endpoints exist today.

## Vercel and deployment

- Current Vercel project slug is still `sandra-university`.
- Current custom domain is `institute.bmhgroupkc.com`.
- Legacy fallback Vercel domains still include `sandra-university`.
- `next.config.ts` sets Server Actions allowed origins to `institute.bmhgroupkc.com` and `localhost:3100`.
- `next.config.ts` sets Server Actions body size limit to `25mb`.
- After monorepo migration, create or reconfigure the Vercel project with Root Directory `apps/bmh-institute/` and platform-standard install/build commands.

## Custom scripts and hooks

- `npm run dev`: `next dev --webpack -p 3100`.
- `npm run start`: `next start -p 3100`.
- `npm run verify`: `npm run typecheck && npm run test && npm run test:rtl`.
- `npm run test:e2e`: local Playwright suite using the non-production Supabase project.
- `npm run test:prod`: read-only production smoke suite.
- `npm run test:prod:readiness`: production-readiness suite with disposable prefixed production writes and cleanup.
- `npm run test:prod:dryrun`: production pilot dry-run suite.
- `npm run seed:e2e`: seeds non-production E2E data.
- `npm run cleanup:prod-readiness`: cleans production-readiness data by prefix.
- `npm run cleanup:prod-dryrun`: cleans pilot dry-run data by prefix.
- `npm run backfill:sanitize-html`: content HTML sanitization backfill.
- Husky pre-commit hook runs `npm run verify`.

## Path-sensitive and non-obvious details

- Runtime source should not depend on the standalone repo path.
- Planning and Stitch docs contain absolute local paths under `/Users/jarradhenry/Sites/`. Those are documentation and design-handoff references, not runtime imports.
- `.stitch/DESIGN.md` points at sibling app and design-system source files for visual reference. It should be revisited after migration because those paths will change.
- `@sandra/tokens` is consumed from the external Sandra Design System GitHub repo. This is the main dependency surprise for migration.
- `ROLE_PLAY_JWT_SECRET` must match Closer Lab's role-play JWT secret for embedded role-play completion.
- BMH Institute owns its own Supabase schema and auth today. Do not add direct reads to other BMH app Supabase projects before the platform integration contracts exist.
- Current auth is Supabase Auth. Clerk migration is a later platform phase and should not be started inside this repo independently.
- Production readiness assumes no active learner population yet and uses disposable prefixed production records plus cleanup helpers.

## Current app boundaries

- BMH Institute is the LMS and internal training platform.
- It is not Sandra Practice. Voice runtime, live role-play scenario execution, mic input, transcription, scoring runtime, transcripts, and recording playback belong outside this repo unless a future contract says otherwise.
- The current role-play surface embeds or records results from Closer Lab through a signed token and role-play block flow. Do not convert that into a direct cross-app database dependency.

## Migration-day reminders

- Preserve history with `git filter-repo --to-subdirectory-filter apps/bmh-institute/`.
- Keep `package-lock.json` until the migration branch intentionally converts the app to pnpm under the platform root.
- Recreate app-specific Vercel env vars on the new Vercel project. Values are not in this file.
- Verify from the platform root with `pnpm --filter bmh-institute build`.
- Add `apps/bmh-institute/AGENTS.md` with app purpose, commands, env names, emitted events, consumed events, and integration endpoints.
