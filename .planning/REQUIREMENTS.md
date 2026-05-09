# Requirements: v1.1 Internal Pilot Operations

## Goal

Make BMH Institute ready for BMH Group's first real internal learner pilot.

## Pilot Cohort Setup

- [x] PILOT-01: Admin can define or identify the first internal pilot cohort and see who is ready to be invited.
- [x] PILOT-02: Admin can assign pilot learners to the correct role groups, programs, and courses before launch.
- [x] PILOT-03: Admin can send pilot invites with enough status visibility to know who has accepted, expired, or still needs action.
- [x] PILOT-04: Admin can safely correct pilot learner access mistakes without direct database edits.

## Learner Onboarding

- [x] LEARN-01: Invited learner can understand the first thing to do after signing in.
- [x] LEARN-02: Learner can clearly see assigned programs, required courses, and completion expectations.
- [x] LEARN-03: Learner can recover from common onboarding issues, including password reset and incomplete profile setup.
- [x] LEARN-04: Learner-facing copy is plain enough for async VA training where English may be a second language.

## Pilot Monitoring

- [x] OPS-01: Admin can see pilot progress by learner, program, course, quiz, assignment, and certificate state.
- [x] OPS-02: Admin can quickly identify learners who are stalled, blocked, pending review, or ready for certification.
- [x] OPS-03: Admin can act on pending submissions and learner blockers from the monitoring flow.
- [x] OPS-04: Admin can export or record pilot status evidence for internal review.

## Operational Readiness

- [x] RUN-01: Team has a production pilot runbook that covers launch, monitoring, common support cases, and rollback.
- [x] RUN-02: Team has a reusable pre-pilot checklist that verifies domain, email links, auth, content access, submissions, certificates, and cleanup.
- [x] RUN-03: Production-readiness automation covers the pilot-critical flows or clearly records what remains manual.
- [x] RUN-04: Pilot launch does not require spending changes, provider changes, or new infrastructure unless explicitly approved.

## Future Requirements

- [ ] EMBD-01: Role-play block type and `role_play_results` table.
- [ ] EMBD-02: Short-lived embed JWT helper.
- [ ] EMBD-03: `RolePlayBlock` iframe and postMessage listener.
- [ ] EMBD-04: Admin block editor role-play option.
- [ ] EMBD-05: Role-play result persistence and report surfacing.
- [ ] PERF-01: Admin reports overview pagination or aggregation pushdown.
- [ ] PERF-02: User report module query filtering or completion RPC.
- [ ] PERF-03: Signed URL caching.

## Out of Scope

- Sandra Practice voice runtime. This belongs in the standalone Sandra Practice app.
- New paid providers or new hosting tier. The current milestone must stay inside the existing Google Workspace, Supabase, and Vercel setup unless Jarrad approves spending.
- Broad content authoring redesign. This milestone focuses on running the pilot, not rebuilding the LMS authoring model.
- Mobile-native app work.

## Traceability

| Requirement | Phase |
|-------------|-------|
| PILOT-01 | Phase 6 |
| PILOT-02 | Phase 6 |
| PILOT-03 | Phase 6 |
| PILOT-04 | Phase 6 |
| LEARN-01 | Phase 7 |
| LEARN-02 | Phase 7 |
| LEARN-03 | Phase 7 |
| LEARN-04 | Phase 7 |
| OPS-01 | Phase 8 |
| OPS-02 | Phase 8 |
| OPS-03 | Phase 8 |
| OPS-04 | Phase 8 |
| RUN-01 | Phase 9 |
| RUN-02 | Phase 9 |
| RUN-03 | Phase 9 |
| RUN-04 | Phase 9 |
