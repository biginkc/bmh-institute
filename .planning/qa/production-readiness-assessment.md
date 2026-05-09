# Production readiness hardening assessment

Date: 2026-05-09
Status: not production-ready

## Purpose

Track whether BMH Institute is production-ready as a complete application, not only whether it has enough Playwright coverage.

The application is not production-ready until repeatable validation proves the full production stack works with real services: production auth, production Supabase database writes, production storage, production email delivery, production deployment, cleanup, recovery, and provider failures. No fake APIs, mocked providers, mocked email, mocked storage, mocked auth, or simulated database behavior can satisfy this gate.

## Current verdict

| Area | Status | Reason |
|------|--------|--------|
| Overall application readiness | Not ready | Production write-path validation is not automated and repeatable yet. |
| Production auth and onboarding | Not ready | Invite acceptance and first-password setup are not repeatably validated with real production email. |
| Password reset | Not ready | Reset-link delivery and completion are not repeatably validated through the real production provider. |
| Learner lifecycle | Partially ready | Manual production smoke covered important paths, but the complete lifecycle is not automated against production. |
| Admin review lifecycle | Partially ready | Manual production smoke covered review paths, but revision, approval, and cleanup need repeatable production validation. |
| Certificates | Partially ready | Trigger behavior has integration coverage, but production UI issuance and print/download validation are not repeatable. |
| Storage uploads | Partially ready | Server-side prefix validation exists, but production upload, readback, and cleanup are not repeatably validated. |
| Access control and RLS isolation | Partially ready | Unit, integration, and smoke checks exist, but cross-user production isolation needs full Playwright proof. |
| Content safety | Partially ready | Sanitization and embed hardening are implemented, but production unsafe-content save/render checks need repeatable coverage. |
| Rate limiting and abuse controls | Partially ready | Code, unit, and live RPC proof exist, but production UI behavior under real limits needs controlled validation. |
| Deployment and rollback | Blocked | A repeatable production deployment, custom-domain, env-var, and rollback validation workflow is not documented or automated. |
| Observability and recovery | Blocked | Failure artifacts exist for Playwright, but production cleanup and interrupted-run recovery need a runbook. |

Allowed statuses:

- `Ready`
- `Partially ready`
- `Not ready`
- `Blocked`

## Production-grade validation requirements

All production-readiness checks must:

- run against the deployed production application URL
- use real production auth
- use real Supabase production database reads and writes
- use real Supabase production storage uploads and downloads
- use the configured production email provider
- use real provider calls and fail when those providers fail
- clean up disposable users, records, and storage objects created by the check
- record screenshots, traces, cleanup logs, and identifiers for failed runs
- leave enough information for manual cleanup if interrupted

The current seeded test-database CI suite remains useful for PR regression coverage. It does not prove production readiness because it does not validate the real production provider stack.

## Required production validation scenarios

### Auth and onboarding

- Admin sends a real learner invite through the production UI.
- The configured production email provider sends the invite email.
- Playwright retrieves the real invite link from the approved production test inbox or capture mailbox.
- Learner accepts the invite and sets the first password.
- Learner signs in with the new password.
- Cleanup removes the disposable auth user, profile, role groups, progress, submissions, certificates, and storage objects.

### Password reset and email delivery

- Existing production test user requests forgot-password.
- The configured production email provider sends the reset email.
- Playwright retrieves the real reset link from the approved production test inbox or capture mailbox.
- User sets a new password and signs in with that password.
- Cleanup restores the original password or recreates the disposable test user safely.
- Rate-limit behavior is verified without locking out operators or consuming normal-user limits.

### Learner lifecycle

- Learner sees only assigned programs and courses.
- Unassigned learner sees no assigned training.
- Learner opens a course and lesson.
- Learner completes a required content block.
- Learner submits a quiz attempt and sees the real pass or retry state.
- Learner submits a text assignment.
- Learner uploads a file assignment to real production storage.
- Learner sees the resulting submitted or pending state.

### Admin review lifecycle

- Admin sees the learner submission in the production review queue.
- Admin opens the submission detail.
- Admin requests revision with reviewer notes.
- Learner sees revision requested state.
- Learner resubmits the assignment.
- Admin approves the resubmission.
- Learner sees approved state.

### Certificate lifecycle

- Completing required course or program work triggers real certificate issuance.
- Certificate appears in the learner certificate UI.
- Certificate number is persisted in production.
- Certificate print or download path renders successfully.
- Cleanup removes disposable certificate rows created by the test.

### Storage, access control, and RLS isolation

- Learner cannot reach admin routes or admin data through direct navigation.
- Learner cannot see another learner's submissions, certificates, or progress.
- Learner cannot access unrelated course content.
- Learner cannot upload assignment files outside their storage prefix.
- Unassigned learner cannot access assigned course content.
- Storage upload is readable through the intended signed URL path and removed during cleanup.
- Admin-only paths remain available to owner/admin production test users.

### Content safety

- Admin saves a text block containing unsafe HTML in production.
- Stored production row is sanitized.
- Learner render does not include script tags or unsafe attributes.
- Admin saves an embed block with a valid HTTPS iframe URL.
- Learner render includes the sandbox attribute.
- Invalid non-HTTPS embed source is rejected through the production UI.
- Disposable unsafe-content fixture is cleaned up.

### Deployment, rollback, observability, and recovery

- Custom domain resolves to the expected latest production deployment.
- Required production environment variables are present and effective.
- Production deployment health checks pass after deploy.
- Rollback path is known, documented, and tested on a disposable deployment or approved rollback drill.
- Playwright artifacts include traces, screenshots, and cleanup logs.
- Interrupted-run cleanup has a documented manual runbook using disposable prefixes and recorded IDs.

## Required production test infrastructure

- Dedicated production-safe admin test account.
- Dedicated production-safe learner test account.
- Dedicated production-safe unassigned learner test account.
- Dedicated production-safe role group, program, course, lesson, quiz, assignment, and certificate naming prefix.
- Approved production email inbox or capture mailbox accessible to CI.
- CI secrets for production app URL, production test credentials, and email inbox access.
- Cleanup helpers that delete disposable auth users, database records, and storage objects by prefix.
- Manual cleanup runbook for interrupted runs.
- Workflow-level concurrency so two production-readiness runs cannot mutate the same disposable fixtures simultaneously.

## Automation model

- Keep the existing non-production Supabase CI suite for pull-request regression coverage.
- Add a separate production readiness workflow later.
- Do not run production readiness on every PR by default because it performs real provider calls and real production writes.
- Run production readiness on demand before release and on a scheduled cadence.
- Treat production readiness as a release gate before calling the app production-ready.

## Open blockers and risks

- Production email capture is the main blocker for invite and password reset automation.
- Production writes require strict disposable prefixes and cleanup so tests do not pollute real learner records.
- Password reset tests must avoid locking out real operators or consuming normal-user rate limits.
- Storage cleanup must verify files are removed from the real bucket.
- Rollback validation needs an explicit safe drill so it does not disrupt live users.
- Observability is not complete until failed production readiness runs leave enough artifacts to diagnose provider, auth, database, storage, and cleanup failures.

## Success condition

BMH Institute can be called production-ready only after the production readiness workflow repeatedly passes auth and onboarding, password reset, learner lifecycle, admin review, certificates, storage, access control, content safety, rate limiting, deployment, rollback, observability, cleanup, and recovery checks against real production services with no mocked providers.
