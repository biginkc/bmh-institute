# Production readiness Playwright coverage plan

Date: 2026-05-09
Status: planned

## Purpose

Track the production-grade Playwright coverage BMH Institute still needs before the application can be called production-ready.

This plan is about automated and repeatable production validation. It must use real production services, real provider calls, real auth, real storage, and real database writes. It does not rely on fake APIs, mocked providers, mocked emails, mocked storage, mocked auth, or simulated database behavior.

## Definition of production-grade

A production-grade Playwright check must:

- run against the deployed production application URL
- authenticate through the real production auth provider
- use real Supabase production database reads and writes
- use real Supabase production storage uploads and downloads
- use the configured production email provider for invite and password reset messages
- clean up any disposable users, records, and storage objects it creates
- fail loudly when a real provider call fails
- record screenshots, traces, and failure artifacts for debugging

## Current baseline

Already covered outside this plan:

- PR #22 adds seeded CI Playwright coverage against the non-production Supabase project
- production smoke coverage has previously checked login, dashboard access, some learner paths, admin review paths, and Phase 2 embed hardening
- `npm run verify` covers typecheck, unit tests, and RTL tests

Those checks are useful. They are not enough to call the app production-ready because they do not repeatedly validate the full production stack with real provider side effects.

## Required production Playwright flows

### Auth and onboarding

- Admin invites a learner through the production UI
- Production email provider sends the invite email
- Playwright retrieves the real invite link from the production email destination or approved capture mailbox
- Learner accepts the invite
- Learner sets the first password
- Learner can sign in with the new password
- Disposable learner is cleaned up from auth, profile, role groups, progress, submissions, certificates, and storage

### Password reset

- Existing production test user requests forgot-password
- Production email provider sends the reset email
- Playwright retrieves the real reset link from the production email destination or approved capture mailbox
- User sets a new password
- User can sign in with the new password
- Password is restored or user is recreated during cleanup
- Rate-limit behavior is verified without leaving the production user locked out

### Learner course lifecycle

- Learner sees only assigned programs and courses
- Unassigned learner sees no assigned training
- Learner opens a course
- Learner opens a lesson
- Learner completes a required content block
- Learner submits a quiz attempt
- Learner sees the pass or retry state from the real scoring path
- Learner submits a text assignment
- Learner uploads a file assignment to production storage
- Learner can view the resulting submitted or pending state

### Admin review lifecycle

- Admin sees the learner submission in the production review queue
- Admin opens the submission detail
- Admin requests revision with reviewer notes
- Learner sees revision requested state
- Learner resubmits the assignment
- Admin approves the resubmission
- Learner sees approved state

### Certificate lifecycle

- Completing the required course or program triggers real certificate issuance
- Certificate appears in learner certificate UI
- Certificate number is persisted in production
- Certificate print or download path renders successfully
- Cleanup removes disposable certificate rows created by the test

### Access control and isolation

- Learner cannot reach admin routes or admin data through direct navigation
- Learner cannot see another learner's submissions, certificates, or progress
- Learner cannot upload assignment files outside their storage prefix
- Unassigned learner cannot access seeded or disposable assigned course content
- Admin-only paths remain available to owner/admin production test users

### Content safety in production

- Admin saves a text block containing unsafe HTML
- Stored production row is sanitized
- Learner render does not include script tags or unsafe attributes
- Admin saves an embed block with a valid HTTPS iframe URL
- Learner render includes the sandbox attribute
- Invalid non-HTTPS embed source is rejected through the production UI
- Disposable content is cleaned up

## Required production test infrastructure

- dedicated production-safe admin test account
- dedicated production-safe learner test account
- dedicated production-safe unassigned learner test account
- dedicated production-safe role group and program naming prefix
- approved production email inbox or capture mailbox accessible to CI
- CI secrets for production app URL, test user credentials, and email inbox access
- cleanup helpers that delete disposable auth users, database records, and storage objects by prefix
- runbook for manually cleaning up if a workflow is interrupted

## Open risks

- Production email capture is the main blocker for invite and password reset automation.
- Production writes require strict prefixing and cleanup so tests do not pollute real learner records.
- Password reset tests must avoid locking out real operators or consuming rate limits for normal users.
- Storage cleanup must verify files are removed from the real bucket.
- These checks may be too expensive or invasive to run on every commit. They may need a scheduled or pre-release workflow while the lighter test-database E2E suite runs on every PR.

## Recommended execution model

Run two Playwright tiers:

1. PR tier: non-production Supabase, seeded content, runs on every pull request and push to main.
2. Production readiness tier: real production services, real provider calls, real writes, runs on demand before release and on a scheduled cadence.

Production readiness should become a required release gate before the app is described as production-ready.

## Success condition

BMH Institute can be called production-ready only after the production readiness workflow repeatedly passes the auth, onboarding, password reset, learner lifecycle, admin review, certificate, access-control, storage, and content-safety flows against real production services with no mocked providers.
