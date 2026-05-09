---
status: complete
completed: 2026-05-09
---

# Align BMH Institute dashboard shell with sibling apps

Completed:

- Compared BMH Institute against Sandra CRM and Closer Lab shell implementations.
- Flattened the BMH primary left rail to match sibling apps.
- Added `My Profile` to the primary left rail so profile access is not tied to a mobile-only header link.
- Removed the separate mobile horizontal nav strip from the dashboard layout.
- Matched sibling header spacing and brand-link affordance while preserving BMH Institute product copy.
- Added regression coverage for the fixed header, desktop rail, flat nav contract, and profile nav item.

Verification:

- `npm test -- "src/app/(dashboard)/layout.test.ts"`
- `npm run test:rtl -- "src/app/(dashboard)/sidebar-nav.test.tsx"`
- `npm run verify`
- `npm run build`

Browser verification note:

- `npm run test:e2e -- e2e/dashboard-smoke.spec.ts` could not run in this worktree because `.env.test.local` does not define `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, or `TEST_SUPABASE_SERVICE_ROLE_KEY`. Playwright started the web server with empty Supabase vars and middleware failed before login.
