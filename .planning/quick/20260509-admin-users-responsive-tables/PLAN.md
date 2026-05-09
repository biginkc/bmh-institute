# Admin Users Responsive Tables Plan

## Goal

Fix the first open item from `.planning/qa/ISSUE-6-content-admin-polish-triage.md`: dense `/admin/users` tables should not clip on desktop or mobile widths.

## Scope

- Add a regression on `/admin/users` table scroll regions.
- Add explicit scroll wrappers around pilot setup, active members, and pending invites tables.
- Keep the existing table primitive and page layout.
- Run focused tests and `npm run verify`.

## Browser verification

Local browser verification needs app env values that are not present in this fresh worktree. The PR should rely on the seeded E2E and Vercel preview checks for browser confidence unless local env is made available.
