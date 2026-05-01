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
  duration: ~15 minutes
  completed: 2026-04-30
  tasks_completed: 3
  tasks_total: 5
  status: CHECKPOINT_REACHED
---

# Phase 1 Plan 4: Answer Options Public View Summary

One-liner: Definer-mode view `answer_options_public` isolating `is_correct` from learner anon-key reads; learner lesson page switched to two-query join; quiz scoring fetch switched to service-role client.

## Status

PAUSED at Task 4 (checkpoint:human-verify) - migration push to production Supabase required.

Tasks 1-3 complete. Tasks 4-5 pending migration push.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Test inventory review | (no commit - inventory only) | none |
| 2 | Write failing tests | 170725e | quiz-actions.test.ts, answer-options-isolation.integration.test.ts |
| 3 | Author migration, update learner page, switch scoring action | 6f43005 | 008_answer_options_public_view.sql, page.tsx, quiz-actions.ts, quiz-actions.test.ts (mock fixes), answer-options-isolation.integration.test.ts (type fixes) |

## Migration 008

File: `supabase/migrations/008_answer_options_public_view.sql`

- Creates `public.answer_options_public` view with `security_invoker = off` (definer mode)
- Pinned column list: `id, question_id, option_text, sort_order` (excludes `is_correct`)
- Drops `answer_options_learner_read` policy on the underlying table
- GRANTs SELECT on the view to `authenticated`
- REVOKEs SELECT on the underlying table from `authenticated`
- Preserves `answer_options_admin_all` policy (admin lesson editor continues to read `is_correct`)

NOT YET APPLIED to production (ref `dhvfsyteqsxagokoerrx`).

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
- Will exercise real RLS boundary AFTER migration is applied (Task 4)
- Use throwaway-user pattern (createUser/signIn/deleteUser via service role)
- Env vars: `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` from `.env.test.local`

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

## Pending (Awaiting Human Action)

Task 4: Apply migration 008 to production Supabase (ref `dhvfsyteqsxagokoerrx`)

Migration contents are in `supabase/migrations/008_answer_options_public_view.sql`.

Apply via:
```bash
supabase db push
```
Or paste the file contents into the Supabase Dashboard SQL editor.

After applying, verify:
- `supabase db push` exits 0
- A service-role SELECT on `answer_options_public` returns rows or empty array (not a "view not found" error)
- An anon-key SELECT on `answer_options` is denied or returns empty

Then run Task 5:
```bash
npm run test:integration -- answer-options-isolation
npm run verify
```

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

### npm run verify status

GREEN: 77 tests passed, 0 typecheck errors (as of Task 3 commit)

## Self-Check: PASSED
