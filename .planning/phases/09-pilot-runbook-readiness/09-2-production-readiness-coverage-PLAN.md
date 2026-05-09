# Plan 09-2: Production Readiness Coverage

## Goal

Extend production readiness automation to cover the pilot monitoring surface.

## Scope

- Update `e2e-prod/production-readiness.spec.ts`.
- Reuse the existing disposable production fixture.
- Verify the monitoring panel and export link render for the pilot fixture.

## Tasks

1. Add production readiness assertions for `/admin/reports` pilot monitoring.
2. Confirm the seeded learner and unassigned learner create actionable monitoring rows.
3. Confirm the CSV export endpoint is visible from the admin UI.
4. Run `npm run verify`.

## Acceptance

- Production readiness covers pilot monitoring at least as a smoke check.
- The new checks do not add new spending, providers, or infrastructure.
- Cleanup remains handled by the existing fixture cleanup flow.

