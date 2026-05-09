# Plan 08-1 Summary: Monitoring Summary Model

Status: complete

## Completed

- Added `src/lib/pilot-monitoring/summary.ts`.
- Added focused unit coverage in `src/lib/pilot-monitoring/summary.test.ts`.
- Model now classifies learner rows as needs access, needs revision, needs review, not started, in progress, or certified.
- Model returns totals and row-level action targets for UI and export reuse.

## Verification

- `npm run test -- src/lib/pilot-monitoring/summary.test.ts` passed.

