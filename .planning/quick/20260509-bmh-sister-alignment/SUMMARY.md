---
status: complete
completed: 2026-05-09
---

# BMH sister alignment foundation

Completed first alignment slice:

- Added a token regression test for the shared `@sandra/tokens` dependency and cross-app status utilities.
- Added `@sandra/tokens` from `../Sandra Design System`, matching Sandra, Jitter, and Closer Lab.
- Replaced local token ownership in `globals.css` with `@import "@sandra/tokens/theme.css";`.
- Added the registry-style `BrandLockup` component locally and used it in the dashboard shell.
- Switched local dev to `next dev --webpack -p 3100`, matching Closer Lab's workaround for linked design-system CSS.
- Browser checked `/login` after copying local env files into the worktree.

Verification:

- `npm test -- src/app/globals.test.ts`
- `npm run verify`
- `npm run build`
- `npx playwright screenshot --wait-for-timeout=1000 http://localhost:3100/login .planning/qa/bmh-sister-alignment-login.png`

Notes:

- The first browser run failed because the clean worktree had no `.env.local`. Copied ignored local env files from the main checkout and reran successfully.
- The package import initially exposed Turbopack's linked CSS boundary issue. `turbopack.root` matched Jitter's fix but made Tailwind resolve from the shared parent root in this app, so the final fix follows Closer Lab and uses webpack for local dev.
- Chrome reported a hydration warning caused by the local `data-scribe-recorder-ready` browser extension attribute. Playwright did not reproduce that warning.
