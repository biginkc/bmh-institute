# Plan 07-2: Dashboard Onboarding Surface

## Goal

Make `/dashboard` tell a learner what to do first and what completion means.

## Scope

- Reuse the existing dashboard route and shell.
- Add a compact onboarding panel above assigned programs.
- Improve empty assigned-program copy.
- Keep cards and typography consistent with the current dashboard and sibling app shell.

## Tasks

1. Extend dashboard data fetching enough to feed the onboarding summary model.
2. Render a first-action panel with the next course or lesson link when available.
3. Render a progress summary with plain-language expectations.
4. Add recovery links to profile and forgot-password.
5. Extend dashboard page tests for assigned and unassigned learner states.
6. Run `npm run verify`.

## Acceptance

- A learner with assigned content sees one clear first action.
- A learner with no assigned content sees support-oriented copy.
- Required course and lesson expectations are visible without opening every course.
- Copy uses plain short sentences.
