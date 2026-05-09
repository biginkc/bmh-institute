---
status: complete
task: prod-email-link-capture
date: 2026-05-09
---

# Summary

Added the production email-link capture harness.

Implemented:
- `e2e-prod/email-capture.ts` IMAP polling helper.
- Real production invite-link Playwright coverage gated by mailbox secrets.
- Real production forgot-password recovery-link Playwright coverage gated by mailbox secrets.
- GitHub Actions env wiring for IMAP mailbox secrets.
- Documentation for mailbox secret setup.
- Vercel production `NEXT_PUBLIC_APP_URL` was set to `https://institute.bmhgroupkc.com`, current `main` was redeployed, and `institute.bmhgroupkc.com` was aliased to the fresh production deployment.

Verification:
- `npm run verify` passed locally.
- GitHub Actions production-readiness run `25596438899` passed after the env update and redeploy. Result: 2 passed, 1 skipped on `main` before this branch's email-link specs landed.

Remaining blocker:
- Add `PROD_READINESS_EMAIL_INBOX` and `PROD_READINESS_EMAIL_IMAP_PASS` at minimum. Optional mailbox overrides are documented in `docs/test-environment-setup.md`.
