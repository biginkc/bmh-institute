# TEST-03 missing Playwright coverage plan

Date: 2026-05-09
Status: planned

## Purpose

Track the remaining TEST-03 functionality that still needs durable Playwright coverage now that PR #22 provides a non-production Supabase project, seeded LMS content, and a GitHub Actions E2E job.

This plan is about automated coverage. It does not mean the product flows are absent from the app.

## Current baseline

Already covered by PR #22:

- test Supabase project exists: `bmh-institute-test` (`jvaabkchkihkjllehmft`)
- `npm run seed:e2e` creates LMS fixture users and content
- seed script refuses production ref `dhvfsyteqsxagokoerrx`
- GitHub Actions runs `npm run verify`
- GitHub Actions seeds the test database
- GitHub Actions runs the current Playwright E2E smoke
- current CI Playwright smoke proves basic authenticated dashboard rendering
- manual Playwright smoke proved owner admin paths, assigned learner course access, and unassigned learner no-training state

## Missing Playwright coverage

- Invite acceptance
- First password setup from invite
- Forgot-password reset link flow
- Password reset completion
- Learner quiz submission
- Learner assignment text submission
- Learner assignment file upload
- Admin assignment approval
- Admin revision request
- Learner resubmission after revision
- Certificate issuance after course or program completion
- Certificate visibility, download, or print path

## Missing test infrastructure

- Non-production email capture for invite links
- Non-production email capture for password reset links
- CI-safe way to read captured links during Playwright runs
- Durable Playwright specs for the seeded content beyond the current dashboard smoke

## Recommended implementation order

1. Add email capture for non-production auth links.
2. Add invite acceptance and first password setup Playwright coverage.
3. Add forgot-password reset link and password reset completion coverage.
4. Add learner quiz submission coverage.
5. Add learner assignment text submission and file upload coverage.
6. Add admin approval and revision request coverage.
7. Add learner revision resubmission coverage.
8. Add certificate issuance and certificate UI coverage.

## Success condition

TEST-03 can close when `npm run test:e2e` in GitHub Actions covers the invite, password reset, quiz, assignment, admin review, revision, and certificate paths against the seeded non-production Supabase project.
