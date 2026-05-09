# Summary 05-1: Shared Dashboard Shell

## Completed

- Added v1 Production Hardening milestone audit at `.planning/milestones/v1-production-hardening-audit.md`.
- Added v1.1 Ecosystem UI Alignment planning state, requirements, roadmap phase, context, and execution plan.
- Replaced the older BMH Institute dashboard shell with the shared ecosystem pattern:
  - fixed 64px topbar
  - brand area aligned to the 256px sidebar column
  - fixed desktop sidebar below the topbar
  - mobile horizontal primary navigation
  - warm paper background and border treatment
  - user identity, role pill, profile access, and sign-out in the topbar
- Updated sidebar navigation to use the shared active left-border pattern instead of a filled active pill.
- Preserved learner/admin route labels, admin-only visibility, pending submissions badge, profile link, and `/auth/signout` form action.
- Added shared `PageHeader` component based on the Sandra pattern.
- Wired `PageHeader` into primary learner/admin entry pages:
  - dashboard
  - certificates
  - admin overview
  - programs
  - courses
  - users
  - submissions
  - role groups
  - reports
- Added RTL coverage for sidebar behavior.
- Added Playwright shell navigation smoke coverage.
- Fixed `playwright.prod.config.ts` so explicit shell-provided `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` override stale `.env.test.local` credentials.

## Verification

- Failing test first:
  - `npm run test:rtl -- src/app/\(dashboard\)/sidebar-nav.test.tsx` failed before implementation because the nav had no accessible Primary label and still used the filled active pill style.
- Focused RTL after implementation:
  - `npm run test:rtl -- src/app/\(dashboard\)/sidebar-nav.test.tsx` passed.
- Full verification:
  - `npm run verify` passed.
  - TypeScript passed.
  - Unit suite passed: 35 files, 170 tests.
  - RTL suite passed: 3 files, 8 tests.
- Browser verification:
  - `E2E_PROD_BASE_URL=http://localhost:3100 E2E_TEST_EMAIL=<temporary-admin> E2E_TEST_PASSWORD=<temporary-password> npm run test:prod -- e2e-prod/shell-navigation.spec.ts` passed.
  - The temporary Supabase auth user was deleted after the Playwright run.

## Notes

- Sibling repos were read for reference only. No files outside BMH Institute were modified.
- Durable write-path Playwright coverage remains deferred to GitHub issue #2.
- The local `.env.test.local` E2E credentials are stale. Shell env override now works for temporary smoke accounts.
