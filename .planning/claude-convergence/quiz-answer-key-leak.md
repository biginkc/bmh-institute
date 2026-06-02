# Quiz answer key leak convergence ledger

## Goal

- goal_id: quiz-answer-key-leak
- goal_description: Prevent learners from reading quiz answer keys through direct `answer_options.is_correct` PostgREST access.
- plan_source: User EXECUTE block on 2026-06-02 and vault validation note `_inbox/2026-06-02 BMH Institute Browser V1 validation (claude).md`.
- baseline_ref: `29a68da` on branch `fix/assignment-autocomplete-no-review`.
- authority_profile: Production-aware with explicit user authorization for this restrictive security migration.

## Acceptance gates

- Learner probe against `/rest/v1/answer_options?select=id,question_id,is_correct&limit=10` does not return answer key values.
- Learner quiz UI still renders options through `answer_options_public`.
- Learner can still submit and pass a quiz through server-side grading.
- `answer_options_public` still returns options without `is_correct`.

## Iteration 1

- Claude surface: existing user-provided EXECUTE block from Claude validation lane. Direct Claude app interaction was not needed for the initial implementation step.
- GSD quick tooling: `gsd:quick` skill was read, but the referenced workflow file under `~/.Codex/get-shit-done/workflows/quick.md` was missing. Created repo-local quick plan manually.
- Local finding: migration `009_answer_options_public_row_filter.sql` re-granted table-level `SELECT` on `public.answer_options` to `authenticated`, making `is_correct` selectable by learners even though `answer_options_public` omits it.
- Adversarial check: a raw `REVOKE SELECT` from `authenticated` would also break the admin quiz editor because Supabase app admins use the same database role. The fix must also move admin answer-key access to a verified server-side service-role path.

## Verification log

- Focused unit tests passed: `npm run test -- "src/app/(dashboard)/admin/lessons/[lessonId]/edit/quiz-actions.test.ts" "src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts"` with 8 tests.
- Full local gate passed on the clean `origin/main` based branch: `npm run verify` with typecheck, 58 unit files, 251 unit tests, 5 RTL files, and 19 RTL tests.
- Build gate passed: `npm run build` on Next.js 16.2.4. Existing middleware-to-proxy deprecation warning remains.
- Applied migration SQL to Supabase prod ref `dhvfsyteqsxagokoerrx` via `npx supabase db query --linked -f supabase/migrations/014_revoke_answer_options_answer_key.sql`.
- Recorded migration history with `npx supabase migration repair 014 --status applied --linked --yes`; `supabase migration list --linked` shows `014 | 014 | 014`.
- Database privilege proof: `information_schema.column_privileges` shows zero `anon` or `authenticated` privileges on `public.answer_options.is_correct`; authenticated `SELECT` remains only for `id`, `question_id`, `option_text`, and `sort_order`.
- Exact learner probe as Browser V1 acquisitions learner: direct `/rest/v1/answer_options?select=id,question_id,is_correct&limit=10` returned HTTP 403, message `permission denied for table answer_options`, no `is_correct` values.
- Public view probe as the same learner: `/rest/v1/answer_options_public?select=id,question_id,option_text,sort_order&limit=10` returned HTTP 200, 10 rows, keys `id`, `option_text`, `question_id`, `sort_order`, and no `is_correct`.
- Focused live integration passed: `npm run test:integration -- "src/app/(dashboard)/lessons/[lessonId]/answer-options-isolation.integration.test.ts"` with 4 tests against prod `dhvfsyteqsxagokoerrx`.
- Live browser quiz-taking proof passed: created disposable `SECURITY-FIX Answer Key Probe` quiz lesson, logged into production UI as Browser V1 multi-track learner, selected the correct option, submitted through the real quiz UI, saw `Passed`, and DB attempt was `{ score: 100, passed: true }`.
- Cleanup proof: disposable `SECURITY-FIX Answer Key Probe%` modules, lessons, quizzes, and the proof attempt all returned count 0 after cleanup.
- Manual diff review passed: remaining `answer_options` app paths are service-role grading, admin editor/action paths after `requireAdmin()`, integration tests, or seeding fixtures. Changed-file secret scan found no committed secret values.

## Residuals

- Direct DB password stored in `Supabase - Sandra Prod DB Password` did not authenticate for this project. The migration was applied through Supabase CLI linked temporary login role instead.
- `node_modules/next/dist/docs/` does not exist in the installed Next package, so the repo-specific local-docs check could not be completed. Verification used installed compiler/tests/build instead.
- `gsd:quick` skill references `~/.Codex/get-shit-done/workflows/quick.md`, but the workflow exists under `~/.claude/get-shit-done/workflows/quick.md`. Repo-local quick artifacts were created manually.
