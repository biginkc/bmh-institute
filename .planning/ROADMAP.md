# Roadmap: BMH Institute

## Shipped Milestones

### v1 follow-up: Production Readiness Evidence

Status: shipped 2026-05-09

Archive:

- Roadmap: `.planning/milestones/v1-follow-up-ROADMAP.md`
- Requirements: `.planning/milestones/v1-follow-up-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1-follow-up-MILESTONE-AUDIT.md`

Delivered:

- Auth and access hardening.
- Testing coverage parity.
- Content safety and password reset rate limiting.
- Sandra Design System Stitch pass.
- Data integrity hardening.
- Type safety and durable write-path test coverage.
- Ecosystem navigation alignment.
- Custom domain and production email-link readiness.

Production evidence:

- GitHub Actions production-readiness run `25598402881` passed from `main` on 2026-05-09.
- Result: 4 passed, 0 skipped.
- Production URL: `https://institute.bmhgroupkc.com`.

## Current Milestone

### v1.1: Internal Pilot Operations

**Status:** shipped 2026-05-09

**Goal:** Make BMH Institute ready for BMH Group's first real internal learner pilot.

Progress: 4 of 4 phases complete.

Production evidence:

- GitHub Actions production-readiness run `25610410328` passed from `main` on 2026-05-09.
- Result: 4 passed.
- Production URL: `https://institute.bmhgroupkc.com`.
- Current production deploys now flow from Vercel Git integration on `main`; manual aliasing is no longer part of the routine release path.

### Phase 6: Pilot Cohort Setup

**Status:** complete 2026-05-09

**Goal:** Give admins a reliable way to prepare the first real pilot cohort.

**Requirements:** PILOT-01, PILOT-02, PILOT-03, PILOT-04

Success criteria:

1. Admin can identify the pilot cohort and confirm each learner's invite and access state.
2. Admin can assign or correct pilot learner role groups and course access without direct database edits.
3. Invite status is visible enough to distinguish accepted, pending, expired, and failed states.
4. The implementation has focused unit or integration coverage for access and invite state changes.

### Phase 7: Learner Onboarding

**Status:** complete 2026-05-09

**Goal:** Reduce first-session confusion for invited VA learners.

**Requirements:** LEARN-01, LEARN-02, LEARN-03, LEARN-04

Success criteria:

1. Invited learner sees a clear first action after sign-in.
2. Learner dashboard explains assigned programs, required courses, and completion expectations.
3. Common onboarding recovery paths are discoverable without admin intervention.
4. Learner-facing copy is reviewed for plain language and verified in the browser.

Delivered:

- Learner onboarding summary model for assigned programs, courses, required lessons, and first action.
- Dashboard first-step panel with next lesson or first course link.
- No-assignment support copy for manager escalation.
- Profile, forgot-password, and set-password recovery copy updates.
- Unit, page, and seeded Playwright e2e coverage.

### Phase 8: Pilot Monitoring

**Status:** complete 2026-05-09

**Goal:** Let admins monitor pilot progress and act on blockers quickly.

**Requirements:** OPS-01, OPS-02, OPS-03, OPS-04

Success criteria:

1. Admin can view pilot progress by learner, program, course, quiz, assignment, and certificate state.
2. Admin can identify stalled learners, pending reviews, and certificate-ready learners.
3. Admin can reach the relevant review or learner detail flow from the monitoring surface.
4. Pilot status can be exported or recorded for internal review.

Delivered:

- Pilot monitoring model for learner blocker and progress states.
- `/admin/reports` pilot panel with action links to access editing, submissions review, and learner reports.
- CSV export route for pilot status evidence.
- Unit, route, and seeded Playwright e2e coverage.

### Phase 9: Pilot Runbook and Readiness Checks

**Status:** complete 2026-05-09

**Goal:** Make the internal pilot repeatable without ad hoc Codex guidance.

**Requirements:** RUN-01, RUN-02, RUN-03, RUN-04

Success criteria:

1. Production pilot runbook covers launch, monitoring, support cases, cleanup, and rollback.
2. Pre-pilot checklist verifies domain, email links, auth, content access, submissions, certificates, and cleanup.
3. Production-readiness automation covers pilot-critical flows or clearly documents manual gaps.
4. No new spending, providers, or infrastructure are introduced without explicit approval.

Delivered:

- Internal pilot runbook.
- Pre-pilot checklist.
- Production readiness coverage for pilot monitoring and CSV export.
- Production deployment and custom domain alias refresh.
- Production readiness run `25600994876` passed.

## Backlog

### Backlog item 999.1: Rename working directory to BMH Institute (complete, 2026-05-08)

Archive:

- Summary: `.planning/phases/999.1-rename-working-directory-to-bmh-institute/999.1-1-SUMMARY.md`
- Verification: `.planning/phases/999.1-rename-working-directory-to-bmh-institute/999.1-VERIFICATION.md`

Completed:

- In-repo sweep of Sandra University naming.
- Local repo folder moved to `/Users/jarradhenry/Sites/BMH Institute`.
- Matching memory/project path moved.
- `.env.local` old rename strings cleared.
- `.vercel/project.json` confirmed with `projectName: "bmh-institute"`.
- `npm run verify` passed from the new path.

### Backlog item 999.2: BMH Platform monorepo migration readiness

**Status:** documentation complete 2026-05-09

Completed:

- Added `MIGRATION-NOTES.md` for the upcoming move into `bmh-platform/apps/bmh-institute/`.
- Captured runtime and package-manager state, env var names, Supabase projects, migrations, CI workflows, scheduled jobs, route handlers, Vercel details, custom scripts, and migration surprises.
- Confirmed the main migration surprise is the external `@sandra/tokens` dependency from the Sandra Design System.

### Backlog item 999.3: Guided walkthrough system extraction plan

**Status:** planned 2026-05-09

Archive:

- Plan: `docs/guided-walkthrough-system.md`
- GitHub issue: `#64`

Decision:

- Keep the BMH Institute walkthrough app-local for now.
- Preserve the shared step, overlay, URL, and path-scoped state contract.
- Copy the pattern into a second app when needed.
- Extract `@bmh/guided-walkthrough` only after three apps need the same behavior.

### Backlog item 999.4: Vercel production domain workflow cleanup

**Status:** complete 2026-05-09

Completed:

- Reconnected the Vercel project to `biginkc/bmh-institute`.
- Set `autoAssignCustomDomains` to true.
- Verified PR #71 created a production Git deployment for commit `405e1dd`.
- Verified `institute.bmhgroupkc.com` was automatically included in production aliases without `vercel deploy --prod` or `vercel alias set`.

## Future Candidates

### Embedded Closer Lab role play

Completed for the internal walkthrough after Closer Lab shipped a usable hosted scenario:

- EMBD-01: role-play block type and `role_play_results` table.
- EMBD-02: short-lived embed JWT helper.
- EMBD-03: `RolePlayBlock` iframe and postMessage listener.
- EMBD-04: admin block editor role-play option.
- EMBD-05: role-play result persistence and report surfacing.

Production-readiness run `25609474981` passed after the embedded role-play walkthrough and user-report surfacing were deployed.

### Performance threshold work

Parked until `docs/performance-thresholds.md` triggers are breached:

- PERF-01: admin reports overview pagination or aggregation pushdown.
- PERF-02: user report module query filtering or completion RPC.
- PERF-03: signed URL caching.

### Shared guided walkthrough package

Tracked by GitHub issue #64 and `docs/guided-walkthrough-system.md`.

Do not extract yet. Wait until at least three BMH apps need the same walkthrough behavior, or until Jarrad explicitly chooses a platform-level implementation.
