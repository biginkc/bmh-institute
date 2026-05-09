---
status: in-progress
created: 2026-05-09
branch: codex/20260508-224250-forgot-password-rate-canary
---

# Forgot-password production rate canary

Goal: add safe production UI proof for forgot-password rate limiting without touching real operators.

Scope:

- Use a disposable `prd-ready-rate-*` email address.
- Submit the production forgot-password form enough times to cross the email threshold.
- Assert the UI remains enumeration-safe and user-facing success is stable.
- Verify the real production `auth_rate_limits` row records the threshold breach.
- Clean up the disposable email rate-limit rows.
- Update the production-readiness assessment.

Out of scope:

- Set-password rate-limit UI proof, which still needs reset-link or recovery-session automation.
