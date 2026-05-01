---
phase: 01-auth-and-access-hardening
plan: 4
subsystem: database-rls
tags: [harden, rls, supabase, quiz, answer-options, security]
dependency_graph:
  requires: []
  provides: [answer_options_public-view, learner-is_correct-isolation]
  affects: [quiz-scoring, learner-lesson-page, admin-lesson-editor]
tech_stack:
  added: [definer-mode-view, answer_options_public]
  patterns: [two-query-in-process-join, admin-client-for-scoring]
key_files:
  created:
    - supabase/migrations/008_answer_options_public_view.sql
    - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts
    - src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts
  modified:
    - src/app/(dashboard)/lessons/[lessonId]/page.tsx
    - src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts
decisions:
  - "Definer-mode view (security_invoker = off) chosen over security-invoker mode because REVOKE on the underlying table would block learner reads through a security_invoker view"
  - "Two-query in-process join chosen over PostgREST embedded FK join because views are not first-class FK targets in PostgREST"
  - "submitQuizAttempt scoring fetch switched to createAdminClient only for the is_correct-bearing query; all other queries remain on the learner session client"
metrics:
  duration: ~20 minutes
  completed: 2026-04-30
  tasks_completed: 5
  tasks_total: 5
  status: COMPLETE
---

# Phase 1 Plan 4: Answer Options Public View Summary

One-liner: Definer-mode view `answer_options_public` isolating `is_correct` from learner anon-key reads; learner lesson page switched to two-query join; quiz scoring fetch switched to service-role client. Migration applied to production with live security verification.

## Status

COMPLETE. All 5 tasks finished. Migration `008_answer_options_public_view.sql` applied to production Supabase (project ref `dhvfsyteqsxagokoerrx`) on 2026-04-30 and verified live.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Test inventory review | (no commit - inventory only) | none |
| 2 | Write failing tests | 170725e | quiz-actions.test.ts, answer-options-isolation.integration.test.ts |
| 3 | Author migration, update learner page, switch scoring action | 6f43005 | 008_answer_options_public_view.sql, page.tsx, quiz-actions.ts, quiz-actions.test.ts (mock fixes), answer-options-isolation.integration.test.ts (type fixes) |
| 4 | Apply migration to production Supabase | (DDL apply, no source commit) | supabase/migrations/008_answer_options_public_view.sql |
| 5 | Live security verification | (orchestrator-recorded SQL evidence below) | none |

## Migration 008

File: `supabase/migrations/008_answer_options_public_view.sql`

- Creates `public.answer_options_public` view with `security_invoker = off` (definer mode)
- Pinned column list: `id, question_id, option_text, sort_order` (excludes `is_correct`)
- Drops `answer_options_learner_read` policy on the underlying table
- GRANTs SELECT on the view to `authenticated`
- REVOKEs SELECT on the underlying table from `authenticated`
- Preserves `answer_options_admin_all` policy (admin lesson editor continues to read `is_correct`)

APPLIED to production (ref `dhvfsyteqsxagokoerrx`) on 2026-04-30 via Supabase MCP `apply_migration`. Recorded as version `20260501012728` in `supabase_migrations.schema_migrations`.

### Live verification (Task 5)

Direct SQL inspection on production confirmed the security property the integration test asserts:

| Property | Query | Expected | Actual |
|----------|-------|----------|--------|
| `authenticated` cannot read underlying table | `has_table_privilege('authenticated', 'public.answer_options', 'SELECT')` | `false` | `false` |
| View columns omit `is_correct` | `pg_attribute` join on `answer_options_public` | `id, question_id, option_text, sort_order` | `id, question_id, option_text, sort_order` |
| `security_invoker` mode | `pg_options_to_table(reloptions)` | `off` (definer) | `off` |
| Removed learner policy | `pg_policies` lookup for `answer_options_learner_read` | absent | absent |
| Preserved admin policy | `pg_policies` lookup for `answer_options_admin_all` | present | present |

The integration test file (`answer-options-isolation.integration.test.ts`) is committed and ready to run, but the project's `.env.test.local` does not yet contain `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`. Live SQL verification above provides equivalent evidence for the same security invariants. Once the env vars are populated, `npm run test:integration -- answer-options-isolation` will execute the full test inventory without source changes.

## Implementation Notes

### Learner lesson page (`src/app/(dashboard)/lessons/[lessonId]/page.tsx`)

Replaced the embedded `answer_options(...)` PostgREST join with a two-query in-process join:
1. Fetch questions scalars from `questions`
2. Fetch options from `answer_options_public` filtered by `question_id IN (...)` 
3. Group in-process via `Map<question_id, options[]>`

Removed the unused `toOptionList` helper (was only used for the old embedded join).

### Quiz scoring action (`src/app/(dashboard)/lessons/[lessonId]/quiz-actions.ts`)

Added `createAdminClient` import. The `is_correct`-bearing scoring fetch now acquires the service-role client via `createAdminClient()` wrapped in try/catch. All other queries (eligibility checks, quiz lookup, attempt insert) remain on the learner session client.

`scoreQuizAttempt` in `src/lib/quizzes/score.ts` is unchanged.

## Test Coverage

Unit tests (`quiz-actions.test.ts`):
- "acquires createAdminClient before fetching questions for scoring" - passes (GREEN)
- "returns the admin-client error when env vars are missing" - passes (GREEN)
- "preserves the existing scoring contract: a fully-correct submission scores 100%" - passes (GREEN)

Integration tests (`answer-options-isolation.integration.test.ts`):
- File committed and ready to run; uses throwaway-user pattern (createUser/signIn/deleteUser via service role)
- Env vars required: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` in `.env.test.local`
- Currently `.env.test.local` only contains E2E (Playwright) vars; the Supabase keys are not yet populated, so the suite cannot execute as a CI gate yet
- The same security property is verified live via service-role SQL evidence above (see "Live verification (Task 5)")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unit test mock for insert chain**
- Found during: Task 3 (npm run verify)
- Issue: The `user_quiz_attempts.insert` mock returned an object but the action calls `.insert().select("id").single()` - the mock didn't chain correctly
- Fix: Updated mock to return chainable `{ select: () => ({ single: async () => ... }) }` shape
- Files modified: quiz-actions.test.ts
- Commit: 6f43005

**2. [Rule 1 - Bug] Fixed TypeScript errors in test files**
- Found during: Task 3 (npm run verify)
- Issue 1: Integration test `withThrowawayLearner` generic type mismatch with `SupabaseClient` generics
- Issue 2: Unit test `attemptInsertSpy` inferred as 0-arg function, flagged when called with `rows`
- Fix: Used `SupabaseClient<any, any, any>` for the helper param; typed spy with optional `_rows` arg
- Files modified: answer-options-isolation.integration.test.ts, quiz-actions.test.ts
- Commit: 6f43005

**3. [Rule 2 - Missing critical functionality] Removed unused `toOptionList` helper**
- Found during: Task 3
- The helper was only used for the embedded `answer_options(...)` join which was replaced. Left it would cause a lint warning and dead code.
- Fix: Removed the `RawOptionRow` type and `toOptionList` function
- Files modified: page.tsx
- Commit: 6f43005

**4. [Rule 3 - Blocking] next/cache mock required**
- Found during: Task 3 (unit test run)
- Issue: `revalidatePath` throws "Invariant: static generation store missing" in test context
- Fix: Added `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` to the unit test
- Files modified: quiz-actions.test.ts
- Commit: 6f43005

## Follow-up (Non-Blocking)

Populate `TEST_SUPABASE_*` keys in `.env.test.local` so the committed integration test runs as a CI gate. Until then, the security invariants are covered by the live SQL evidence captured in Task 5.

## Recommended Manual Smoke (Post-Deploy)

Confirm the admin lesson edit page (`/admin/lessons/[id]/edit`) still renders quiz answer options with the `is_correct` toggle. The existing `answer_options_admin_all` RLS policy (003_rls_policies.sql lines 175-177) is preserved by migration 008 and should keep the admin editor working.

## Threat Surface Scan

No new network endpoints or auth paths introduced. The migration adds one new Postgres view (`answer_options_public`) which closes an existing exposure (T-01-4-01). No new threat surface beyond what is documented in the plan's threat model.

## Known Stubs

None. The view query is fully wired. The integration tests will exercise real data once the migration is applied.

## Self-Check

### Created files exist

- [x] `supabase/migrations/008_answer_options_public_view.sql`
- [x] `src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts`
- [x] `src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts`

### Commits exist

- [x] `170725e` - test(01-auth): HARDEN-04 failing regression
- [x] `6f43005` - feat(01-auth): HARDEN-04 isolate is_correct via answer_options_public view

### Production migration applied

- [x] Recorded in `supabase_migrations.schema_migrations` as `20260501012728_answer_options_public_view`
- [x] `has_table_privilege('authenticated', 'public.answer_options', 'SELECT')` = `false`
- [x] View columns are exactly `id, question_id, option_text, sort_order`
- [x] `security_invoker` reloption is `off`

### npm run verify status

GREEN: 105 tests passed, 0 typecheck errors (post-merge with all four wave-1 plans)

## Self-Check: PASSED
