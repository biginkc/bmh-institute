---
status: in-progress
created: 2026-06-02
branch: fix/quiz-answer-key-leak
---

# Quiz answer key leak

## Goal

Prevent learner sessions from reading `answer_options.is_correct` through direct PostgREST table requests while preserving learner quiz rendering, server-side grading, and admin quiz authoring.

## Scope

- Add a migration that removes broad `SELECT` on `public.answer_options` from `authenticated` and `anon`.
- Grant only non-sensitive answer option columns needed by `answer_options_public`.
- Keep `answer_options_public` invoker-mode row filtering intact.
- Move admin quiz editor answer-key reads and answer option mutations to the service-role client after `requireAdmin()`.
- Tighten integration coverage around the exact `select=is_correct` leak.

## Verification

- `npm run test -- "src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts"`
- `npm run verify`
- `npm run build`
- Apply the migration to Supabase ref `dhvfsyteqsxagokoerrx`.
- Re-run the learner PostgREST probe against `/rest/v1/answer_options?select=id,question_id,is_correct&limit=10`.
- Confirm `answer_options_public` returns option rows without `is_correct`.
- Confirm a learner can still render and pass a quiz.
