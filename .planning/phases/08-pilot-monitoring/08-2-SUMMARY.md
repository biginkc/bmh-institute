# Plan 08-2 Summary: Admin Monitoring Surface

Status: complete

## Completed

- Added a pilot monitoring panel to `/admin/reports`.
- Added totals for needs access, needs revision, needs review, in progress, and certified learners.
- Added action rows that link to learner access editing, submissions review, or learner reports.
- Kept the existing learner, course, program, and activity reports below the new pilot panel.

## Verification

- `npm run test -- src/lib/pilot-monitoring/summary.test.ts src/app/'(dashboard)'/admin/reports/page.test.ts` passed.
- `npm run typecheck` passed.

