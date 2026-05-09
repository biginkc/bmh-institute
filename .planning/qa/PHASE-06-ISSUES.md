# Phase 06 QA Issues

## Pilot setup browser verification

Status: blocked

URL/flow: local Playwright `npm run test:e2e -- e2e/pilot-cohort-setup.spec.ts`.

Expected: local dev server boots with non-production Supabase test URL, anon key, and service-role key, then drives the admin pilot setup flow end to end.

Actual: Next middleware threw `Error: Your project's URL and Key are required to create a Supabase client!` because this worktree has no visible `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, or `TEST_SUPABASE_SERVICE_ROLE_KEY` values.

Evidence: command attempted on 2026-05-09 after adding `e2e/pilot-cohort-setup.spec.ts`; Playwright repeatedly logged the missing Supabase URL/key error from `src/lib/supabase/middleware.ts`.

Next fix: populate `.env.test.local` with non-production `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, and `TEST_SUPABASE_SERVICE_ROLE_KEY`, then rerun `npm run test:e2e -- e2e/pilot-cohort-setup.spec.ts`.
