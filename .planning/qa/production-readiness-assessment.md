# Production readiness hardening assessment

Date: 2026-05-09
Status: partially ready, not production-ready

## Purpose

Track whether BMH Institute is production-ready as a complete application, not only whether it has enough Playwright coverage.

The application is not production-ready until repeatable validation proves the full production stack works with real services: production auth, production Supabase database writes, production storage, production email delivery, production deployment, cleanup, recovery, and provider failures. No fake APIs, mocked providers, mocked email, mocked storage, mocked auth, or simulated database behavior can satisfy this gate.

## Current verdict

| Area | Status | Reason |
|------|--------|--------|
| Overall application readiness | Partially ready | A real production lifecycle check now passes, but invite and password-reset email-link validation is still blocked. |
| Production auth and onboarding | Not ready | Invite acceptance and first-password setup are not repeatably validated with real production email. |
| Password reset | Not ready | Reset-link delivery and completion are not repeatably validated through the real production provider. |
| Learner lifecycle | Ready | On-demand production readiness spec validates assigned and unassigned learners, course access, content completion, quiz pass, text assignment, and file assignment. |
| Admin review lifecycle | Ready | On-demand production readiness spec validates revision request, learner resubmission, admin approval, and cleanup. |
| Certificates | Ready | On-demand production readiness spec validates real course and program certificate issuance plus certificate UI print path. |
| Storage uploads | Ready | On-demand production readiness spec validates real production storage upload, signed URL creation, user-prefix path, and cleanup. |
| Access control and RLS isolation | Ready | Production readiness spec validates route protection, assigned versus unassigned learner access, direct RLS reads, cross-user submission isolation, and storage prefix isolation. |
| Content safety | Ready | Production readiness spec validates unsafe text-block save sanitization, learner render safety, HTTPS-only embed validation, and iframe sandboxing. |
| Rate limiting and abuse controls | Partially ready | Forgot-password production UI behavior is covered with disposable email counters. Set-password production UI behavior still needs reset-link or recovery-session automation. |
| Deployment and rollback | Blocked | The Vercel rollback drill passed for `sandra-university.vercel.app`, but the custom domain still does not resolve. |
| Observability and recovery | Ready | Playwright traces, screenshots, cleanup verification, and an interrupted-run cleanup runbook now exist. |

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

Implemented production validation:

- `npm run test:prod:readiness`
- `.github/workflows/production-readiness.yml`
- `e2e-prod/production-readiness.spec.ts`

The implemented check creates disposable prefixed production auth users, database records, and storage files. It signs in through the real production app, exercises the learner and admin lifecycle, verifies certificates, and cleans up the fixture.

GitHub production-readiness secrets have been configured for the production app URL, Supabase URL, Supabase anon key, Supabase service-role key, and disposable-user password. The production app URL currently points to `https://sandra-university.vercel.app` because the owned custom domain `https://institute.bmhgroupkc.com` is not configured yet.

`institute.bmhgroupkc.com` has been added to the Vercel project `sandra-university`. Vercel reports the domain is not configured properly because DNS does not point the subdomain at Vercel. The required DNS record is `A institute.bmhgroupkc.com 76.76.21.21`. Current nameservers are `ns47.domaincontrol.com` and `ns48.domaincontrol.com`.

Latest evidence:

- GitHub Actions production-readiness run `25589792026` passed on 2026-05-09 from `main`.
- Result: 1 lifecycle test passed, 1 email-link test skipped because no production email inbox capture is configured.
- Post-run cleanup verification found 0 prefixed production programs, courses, modules, lessons, role groups, assignments, quizzes, answer options, and auth users.
- Local production-readiness run on 2026-05-09 passed after adding content-safety coverage. It verified unsafe text-block sanitization through the admin UI, HTTPS-only embed validation through the admin UI, sandboxed learner iframe rendering, and cleanup of the disposable fixture.
- Local production-readiness run on 2026-05-09 passed after adding access-control coverage. It verified assigned and unassigned learner route behavior, direct production RLS reads through learner-scoped Supabase clients, cross-user submission isolation, blocked cross-prefix storage reads and writes, and cleanup of the disposable fixture.
- Production-readiness recovery runbook added on 2026-05-09 at `docs/production-readiness-recovery.md`, backed by the dry-run-first `npm run cleanup:prod-readiness` script. The first dry run found 5 timestamped storage leftovers from earlier canary runs; execute mode removed them. After fixing fixture cleanup, a fresh production-readiness run left 0 remaining leftovers.
- Local production-readiness run on 2026-05-09 passed after adding forgot-password rate-limit coverage. It submitted a disposable `prd-ready-rate-*` email through the production UI until the real email counter exceeded the threshold, verified the UI remained enumeration-safe, and confirmed 0 disposable rate-limit email rows remained after cleanup.
- GitHub Actions production-readiness run `25590873884` passed on 2026-05-09 from `main`. Result: 2 lifecycle and rate-limit tests passed, 1 email-link test skipped.
- Vercel rollback drill passed on 2026-05-09. `sandra-university.vercel.app` was rolled back from `sandra-university-wlvsahai0-jarrad-5416s-projects.vercel.app` to `sandra-university-muv2z3cz7-jarrad-5416s-projects.vercel.app`, verified by `vercel inspect`, then restored to `sandra-university-wlvsahai0-jarrad-5416s-projects.vercel.app` and verified by `vercel inspect` plus an HTTP 307 health response.
- GitHub Actions production-readiness run `25595576897` passed on 2026-05-09 from latest `main` after PRs #40 and #41. Result: 2 lifecycle and rate-limit tests passed, 1 email-link test skipped. The custom domain still returned no A or CNAME answer during local DNS check.

## Required production validation scenarios

### Auth and onboarding

- Admin sends a real learner invite through the production UI.
- The configured production email provider sends the invite email.
- Playwright retrieves the real invite link from the approved production test inbox or capture mailbox.
- Learner accepts the invite and sets the first password.
- Learner signs in with the new password.
- Cleanup removes the disposable auth user, profile, role groups, progress, submissions, certificates, and storage objects.

Current status: blocked until production email inbox/capture credentials are available.

### Password reset and email delivery

- Existing production test user requests forgot-password.
- The configured production email provider sends the reset email.
- Playwright retrieves the real reset link from the approved production test inbox or capture mailbox.
- User sets a new password and signs in with that password.
- Cleanup restores the original password or recreates the disposable test user safely.
- Rate-limit behavior is verified without locking out operators or consuming normal-user limits.

Current status: blocked until production email inbox/capture credentials are available.

### Learner lifecycle

- Learner sees only assigned programs and courses.
- Unassigned learner sees no assigned training.
- Learner opens a course and lesson.
- Learner completes a required content block.
- Learner submits a quiz attempt and sees the real pass or retry state.
- Learner submits a text assignment.
- Learner uploads a file assignment to real production storage.
- Learner sees the resulting submitted or pending state.

Current status: covered by `npm run test:prod:readiness`.

### Admin review lifecycle

- Admin sees the learner submission in the production review queue.
- Admin opens the submission detail.
- Admin requests revision with reviewer notes.
- Learner sees revision requested state.
- Learner resubmits the assignment.
- Admin approves the resubmission.
- Learner sees approved state.

Current status: covered by `npm run test:prod:readiness`.

### Certificate lifecycle

- Completing required course or program work triggers real certificate issuance.
- Certificate appears in the learner certificate UI.
- Certificate number is persisted in production.
- Certificate print or download path renders successfully.
- Cleanup removes disposable certificate rows created by the test.

Current status: covered by `npm run test:prod:readiness`.

### Storage, access control, and RLS isolation

- Learner cannot reach admin routes or admin data through direct navigation.
- Learner cannot see another learner's submissions, certificates, or progress.
- Learner cannot access unrelated course content.
- Learner cannot upload assignment files outside their storage prefix.
- Unassigned learner cannot access assigned course content.
- Storage upload is readable through the intended signed URL path and removed during cleanup.
- Admin-only paths remain available to owner/admin production test users.

Current status: covered by `npm run test:prod:readiness`.

### Content safety

- Admin saves a text block containing unsafe HTML in production.
- Stored production row is sanitized.
- Learner render does not include script tags or unsafe attributes.
- Admin saves an embed block with a valid HTTPS iframe URL.
- Learner render includes the sandbox attribute.
- Invalid non-HTTPS embed source is rejected through the production UI.
- Disposable unsafe-content fixture is cleaned up.

Current status: covered by `npm run test:prod:readiness`.

### Deployment, rollback, observability, and recovery

- Custom domain resolves to the expected latest production deployment.
- Required production environment variables are present and effective.
- Production deployment health checks pass after deploy.
- Rollback path is known, documented, and tested on a disposable deployment or approved rollback drill.
- Playwright artifacts include traces, screenshots, and cleanup logs.
- Interrupted-run cleanup has a documented manual runbook using disposable prefixes and recorded IDs.

Current status: covered by `docs/production-readiness-recovery.md` and `npm run cleanup:prod-readiness`.

### Rate limiting and abuse controls

- Forgot-password uses real production UI submissions with disposable `prd-ready-rate-*` emails.
- The disposable email counter crosses the configured threshold in `auth_rate_limits`.
- The UI remains enumeration-safe and shows the same success state after the threshold is consumed.
- Disposable email rate-limit rows are removed after the check.
- Set-password limit behavior still needs a real recovery session to validate through the production UI.

Current status: forgot-password covered by `npm run test:prod:readiness`; set-password still blocked by email-link or recovery-session automation.

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
- Use the separate production readiness workflow for release-gate validation after it lands on the default branch.
- Do not run production readiness on every PR by default because it performs real provider calls and real production writes.
- Run production readiness on demand before release and on a scheduled cadence.
- Treat production readiness as a release gate before calling the app production-ready.

## Open blockers and risks

- Production email capture is the main blocker for invite and password reset automation.
- `institute.bmhgroupkc.com` is added in Vercel but does not currently resolve. Add `A institute.bmhgroupkc.com 76.76.21.21` in DNS, then switch production-readiness CI back to the custom domain after verification passes.
- GitHub production readiness secrets must use the current production Supabase service-role key. A stale local `.env.local` service-role key caused `Invalid API key` until the current key was injected from the Supabase CLI.
- Production writes require strict disposable prefixes and cleanup so tests do not pollute real learner records.
- Password reset tests must avoid locking out real operators or consuming normal-user rate limits.
- Storage cleanup must verify files are removed from the real bucket.
- Rollback validation needs an explicit safe drill so it does not disrupt live users.
- Keep the recovery runbook current as the production-readiness fixture adds new tables, buckets, or providers.

## Success condition

BMH Institute can be called production-ready only after the production readiness workflow repeatedly passes auth and onboarding, password reset, learner lifecycle, admin review, certificates, storage, access control, content safety, rate limiting, deployment, rollback, observability, cleanup, and recovery checks against real production services with no mocked providers.

As of 2026-05-09, production lifecycle, storage, access control, admin review, certificates, content-safety, forgot-password rate limiting, rollback, and recovery checks pass on latest `main`. The app is still not production-ready because invite acceptance, password reset, and set-password rate-limit UI proof require real production email-link capture, and `institute.bmhgroupkc.com` still requires DNS configuration.
