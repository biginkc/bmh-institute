---
status: complete
task: prod-email-link-capture
date: 2026-05-09
---

# Production Email Link Capture

Goal: add the production-readiness harness for real invite and password-reset email links.

Scope:
- Add an optional IMAP mailbox reader for production-readiness Playwright.
- Replace the placeholder email-link skipped test with real invite and reset-link specs.
- Wire GitHub Actions secrets for mailbox access.
- Document the required mailbox secrets.

Verification:
- `npm run typecheck`
- `npm run test -- src/lib/email-capture.test.ts`
- `npm run verify`
- `npm run test:prod:readiness` should pass with email-link specs skipped until mailbox secrets are configured.
