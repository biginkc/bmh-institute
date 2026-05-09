# Plan 08-3: Export And Browser Verification

## Goal

Give admins a recordable pilot status export and verify the monitoring flow in the browser.

## Scope

- Add an authenticated CSV export route for pilot monitoring rows.
- Add seeded Playwright coverage that proves the report panel and action links render for disposable pilot data.
- Update GSD state after verification.

## Tasks

1. Add an admin-only CSV export route under `/admin/reports/pilot/export`.
2. Reuse the monitoring summary model for CSV row generation.
3. Add seeded Playwright coverage for the pilot monitoring panel and export link.
4. Run `npm run verify`.
5. Run or rely on GitHub Actions seeded e2e if local `TEST_SUPABASE_*` keys are unavailable.
6. Update requirements, roadmap, state, summaries, and verification.

## Acceptance

- Export requires admin access.
- CSV includes learner, email, status, progress, pending submissions, needs revision, certificates, and last activity.
- Browser coverage confirms the pilot panel, action link, and export link.

