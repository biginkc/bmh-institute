# Pre-pilot checklist

Use this checklist before sending internal pilot invites.

## Production access

- [ ] `https://institute.bmhgroupkc.com` loads.
- [ ] Login page loads without browser security warnings.
- [ ] Admin account can sign in.
- [ ] Learner test account can sign in.
- [ ] Learner cannot open `/admin`.

Automated by production readiness:

- [ ] Admin login.
- [ ] Learner login.
- [ ] Learner blocked from admin routes.

## Email links

- [ ] Invite email is delivered to the configured mailbox.
- [ ] Invite link opens `/auth/set-password`.
- [ ] Password setup lands on `/dashboard`.
- [ ] Forgot-password email is delivered.
- [ ] Reset link lands on `/auth/set-password`.
- [ ] New password can sign in.

Automated by production readiness when email capture secrets are configured:

- [ ] Real invite link retrieval.
- [ ] Real recovery link retrieval.

## Pilot cohort setup

- [ ] Open `/admin/users`.
- [ ] Each pilot learner appears in Pilot setup.
- [ ] Each pilot learner has Ready status.
- [ ] No pilot learner has Needs access.
- [ ] Expired or unused invites are revoked or resent.

Automated by seeded e2e:

- [ ] Missing access can be corrected from the Pilot setup table.

## Learner onboarding

- [ ] Learner dashboard shows First step.
- [ ] Learner dashboard shows assigned programs.
- [ ] Learner dashboard shows assigned courses.
- [ ] Learner dashboard shows required lessons.
- [ ] Profile link is visible.
- [ ] Password help link is visible.

Automated by seeded e2e:

- [ ] First action and recovery links render for a disposable learner.

## Content access

- [ ] Learner can open assigned course.
- [ ] Learner can open content lesson.
- [ ] Unassigned learner cannot open assigned course.
- [ ] Unassigned learner cannot open assigned lesson.

Automated by production readiness:

- [ ] Course visibility.
- [ ] Lesson visibility.
- [ ] RLS denial for unassigned learner.

## Submissions and certificates

- [ ] Learner can submit text assignment.
- [ ] Admin can request revision.
- [ ] Learner can resubmit.
- [ ] Admin can approve.
- [ ] Learner can upload file assignment.
- [ ] Course certificate is issued.
- [ ] Program certificate is issued.
- [ ] Certificate page opens.

Automated by production readiness:

- [ ] Text assignment submit, revision, resubmit, approval.
- [ ] File assignment upload and approval.
- [ ] Certificate issuance and certificate page.

## Learner monitoring

- [ ] `/admin/reports` opens.
- [ ] Learner monitoring panel is visible.
- [ ] Needs access rows link to learner access editing.
- [ ] Needs review rows link to submissions.
- [ ] Learner report links open.
- [ ] Export CSV link is visible.

Automated by seeded e2e:

- [ ] Learner monitoring panel and action links render.

Automated by production readiness:

- [ ] Learner monitoring panel and `/admin/reports/learners/export` link render against production fixture.

## Cleanup readiness

- [ ] `docs/production-readiness-recovery.md` is available.
- [ ] Cleanup dry-run command is known.
- [ ] Cleanup execute command is known.
- [ ] Team understands only `PRD-READY-` prefixed disposable data should be deleted.

## Launch decision

- [ ] Production readiness workflow passed from current `main`.
- [ ] No required checklist item is failing.
- [ ] No new spending is needed.
- [ ] Pilot owner approves sending invites.

