# TEST-03 E2E seed content plan

Date: 2026-05-09
Status: seed available, durable Playwright specs added, seeded verification passed in CI

## Goal

Create a repeatable non-production content fixture that makes TEST-03 possible without writing to production. The fixture should let Playwright verify the real LMS paths as admin and learner:

- assigned learner dashboard and course access
- unassigned learner no-access state
- quiz lesson visibility and pass state
- assignment lesson visibility and admin review queue
- admin programs, courses, and submissions navigation

## Supabase target

Use the existing non-production Supabase project:

- project name: `bmh-institute-test`
- project ref: `jvaabkchkihkjllehmft`
- production ref guard: `dhvfsyteqsxagokoerrx`

Do not seed production. The seed script refuses to run if `TEST_SUPABASE_URL` points at the production ref or any ref other than `jvaabkchkihkjllehmft`.

## Fixture content

Run:

```bash
npm run seed:e2e
```

Required environment:

- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_SERVICE_ROLE_KEY`
- `E2E_SEED_PASSWORD` with at least 24 characters for local seeding

The seed creates these reusable users:

- `e2e.owner@bmh-institute.test`
- `e2e.learner@bmh-institute.test`
- `e2e.unassigned@bmh-institute.test`

There is no repository password fallback. CI generates a masked one-run password,
serializes access to the shared test project, and runs `npm run cleanup:e2e` before
uploading its non-trace Playwright report. Local runs must also clean up when they
finish.

The seed creates these content records:

- role group: `E2E Appointment Setters`
- program: `E2E VA Onboarding`
- courses:
  - `E2E BMH Fundamentals`
  - `E2E Objection Handling`
  - `E2E Standalone Policy Refresher`
- quiz lessons:
  - `E2E Knowledge Check`
  - `E2E Policy Check`
- assignment lesson:
  - `E2E Call Notes Assignment`

The assigned learner is attached to the role group, has one required content block completed, has one passed quiz attempt, and has one pending assignment submission. The unassigned learner has no role groups.

## Verification before TEST-03 specs

Before promoting this into durable Playwright coverage, verify:

1. `npm run seed:e2e` succeeds against the test project.
2. Admin sees the seeded program, courses, and pending assignment submission.
3. Assigned learner sees `E2E VA Onboarding`, opens the fundamentals course, and sees the seeded content, quiz, and assignment lessons.
4. Unassigned learner sees `No training assigned yet`.
5. `npm run verify` passes after any code changes.
6. `npm run cleanup:e2e` removes the seeded users and content after the browser run.

## Follow-up

TEST-03 durable Playwright coverage now includes:

- invite acceptance through a generated Supabase invite action link
- first password setup after invite callback
- quiz submission
- assignment upload
- admin approval and revision
- password reset with non-production email capture or a covered server-action fallback
- assigned and unassigned learner access checks
- certificate visibility after required work is approved

Invite acceptance uses Supabase Admin `generateLink` against `bmh-institute-test`, so it does not need an inbox for the non-production E2E suite.

The seed shape remains the baseline CI substrate, but its users and records are
ephemeral. The write-path spec creates its own disposable users and content for
mutable flows, and the CI cleanup step removes all seeded fixtures even after a
failed run.

Current branch status: `npm run verify` passes locally, PR #39 CI passed the durable LMS write-path suite, and PR #40 CI passed invite acceptance through generated Supabase invite action links using the `TEST_SUPABASE_*` secrets for `bmh-institute-test`.
