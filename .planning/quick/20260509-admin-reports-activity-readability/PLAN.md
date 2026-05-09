# Admin Reports Activity Readability Plan

## Goal

Fix the reports readability item from `.planning/qa/ISSUE-6-content-admin-polish-triage.md`: recent activity should help admins distinguish learner actions from system-generated events.

## Scope

- Add a regression for splitting learner activity from system events.
- Keep `formatActivityRow` as the row-level formatter.
- Render learner activity first and move system-generated events into a labeled group.
- Record that the learner empty-state QA item was already handled by Phase 7.
- Run focused tests and `npm run verify`.
