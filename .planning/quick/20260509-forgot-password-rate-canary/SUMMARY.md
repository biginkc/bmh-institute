---
status: complete
completed: 2026-05-09
---

# Forgot-password production rate canary

Completed forgot-password rate-limit coverage:

- Added a production readiness spec that submits a disposable `prd-ready-rate-*` email through `/forgot-password`.
- The spec crosses the real production email rate threshold and verifies the user-facing response stays enumeration-safe.
- The spec asserts the production `auth_rate_limits` email counter exceeded the threshold.
- The spec deletes the disposable email counter in `finally`.
- Updated the production-readiness assessment to distinguish covered forgot-password behavior from still-blocked set-password UI behavior.

Verification:

- `npm run typecheck`
- `npm run test:prod:readiness`
- `npm run cleanup:prod-readiness`
- Direct production query confirmed 0 `prd-ready-rate-*` email rate-limit rows remain.
