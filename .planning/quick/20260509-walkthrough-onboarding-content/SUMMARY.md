# Walkthrough onboarding content summary

Completed durable walkthrough onboarding content for BMH Institute.

Built and merged in PR #60:

- Added `npm run seed:walkthrough`.
- Added a reusable walkthrough curriculum definition under `src/lib/walkthrough/`.
- Added tests that require four modules, multiple lesson types, several block types, and the Closer Lab walkthrough scenario.

Production apply evidence:

- Production seed succeeded on 2026-05-09.
- Program: `BMH Institute Walkthrough Onboarding`.
- Program ID: `e7efda44-7778-4f83-bc1e-32733b325ebe`.
- Course: `Walkthrough Demo: BMH Training Flow`.
- Course ID: `3803c874-b9da-44c7-9e2b-88bc5a870ef2`.
- Role group: `BMH Institute Walkthrough Learners`.
- Role group ID: `19607a75-d76f-4068-b9cf-505ec9639b35`.
- Modules: 4.
- Lessons: 8.
- Lesson types: 6 content, 1 quiz, 1 assignment.
- Block types: 6 text, 5 callout, 2 external link, 1 divider, 1 embed, 1 role play.
- Role-play block ID: `4a9e83a0-c7da-4793-be91-f13e9d1929d0`.
- Role-play scenario ID: `42683d23-5a06-4a49-9c0b-355d6e424c43`.

Verification:

- `npm run test -- src/lib/walkthrough/curriculum.test.ts` passed.
- `npm run seed:walkthrough -- --dry-run` passed.
- `npm run verify` passed locally and in PR #60 CI.
- Main CI after PR #60 passed.
- Production readiness run `25610410328` passed with 4 tests.
- Disposable browser smoke learner reached `/dashboard`, saw `BMH Institute Walkthrough Onboarding`, saw `Walkthrough Demo: BMH Training Flow`, opened the first lesson, and saw `Welcome to BMH Institute`.

Operational note:

- Vercel production `SUPABASE_SERVICE_ROLE_KEY` was empty when first checked. It was repaired from the current Supabase CLI service-role key and production was redeployed as `dpl_XsRNRRUn2namyh8guRVqzhkbsPrt`.
