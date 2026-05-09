# Plan 08-2: Admin Monitoring Surface

## Goal

Make `/admin/reports` show a pilot monitoring panel that points admins to the next action.

## Scope

- Reuse the existing reports page and sibling shell.
- Add a pilot monitoring section above the existing report tables.
- Link action states to user reports, submissions filters, and user access editing.

## Tasks

1. Extend the reports data fetch enough to feed the monitoring model.
2. Render compact totals for blocked, pending review, needs revision, in progress, and certified learners.
3. Render an action table with learner, status, progress, last activity, and action link.
4. Add page tests for the reports page wiring where useful.
5. Run `npm run verify`.

## Acceptance

- Admin sees who needs action without drilling into every learner.
- Pending submission rows link to `/admin/submissions`.
- Blocked access rows link to the learner edit page.
- Learner progress rows link to the learner report.

