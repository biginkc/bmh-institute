---
status: complete
completed: 2026-06-02
---

# Quiz answer key leak summary

Closed the direct PostgREST answer-key leak for `public.answer_options.is_correct`.

## Completed

- Added migration `014_revoke_answer_options_answer_key.sql`.
- Revoked all base-table privileges on `public.answer_options` from `anon` and `authenticated`.
- Granted authenticated sessions only column-level `SELECT` on `id`, `question_id`, `option_text`, and `sort_order`.
- Kept `answer_options_public` selectable for learner quiz rendering.
- Moved admin answer option reads and writes to the service-role client after `requireAdmin()`.
- Tightened integration coverage around the exact `select=is_correct` leak.
- Added unit coverage for admin answer option actions using the service-role client.
- Applied the migration to production Supabase ref `dhvfsyteqsxagokoerrx` and marked migration `014` applied.

## Verification

- `npm run test -- "src/app/(dashboard)/admin/lessons/[lessonId]/edit/quiz-actions.test.ts" "src/app/(dashboard)/lessons/[lessonId]/quiz-actions.test.ts"` passed with 8 tests.
- `npm run verify` passed.
- `npm run build` passed.
- Live integration test passed against prod.
- Browser V1 acquisitions learner direct `answer_options?select=id,question_id,is_correct` probe returned HTTP 403.
- Browser V1 acquisitions learner `answer_options_public` probe returned option rows without `is_correct`.
- Disposable production browser quiz proof passed with score 100 and cleanup confirmed.
