# Phase 9 Context: Pilot Runbook And Readiness Checks

## Goal

Make the internal pilot repeatable without ad hoc Codex guidance.

## Requirements

- RUN-01: Team has a production pilot runbook that covers launch, monitoring, common support cases, and rollback.
- RUN-02: Team has a reusable pre-pilot checklist that verifies domain, email links, auth, content access, submissions, certificates, and cleanup.
- RUN-03: Production-readiness automation covers the pilot-critical flows or clearly records what remains manual.
- RUN-04: Pilot launch does not require spending changes, provider changes, or new infrastructure unless explicitly approved.

## Existing Assets

- `docs/production-readiness-recovery.md` covers cleanup after failed production readiness runs.
- `e2e-prod/production-readiness.spec.ts` already verifies production auth, LMS writes, storage, review, certificates, RLS, invite links, reset links, and rate limiting.
- `.github/workflows/production-readiness.yml` runs the production readiness suite manually with GitHub secrets.

## Direction

Add a plain runbook and checklist for the real internal pilot. Extend production readiness coverage to touch the Phase 8 monitoring panel and export link using the existing disposable production fixture.

