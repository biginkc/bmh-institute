---
status: in-progress
created: 2026-05-09
branch: codex/20260508-225030-record-rollback-drill
---

# Record production rollback drill

Goal: persist evidence from the Vercel rollback drill.

Scope:

- Record the deployment moved from the current production deployment to the previous ready deployment.
- Record the deployment moved back to the original production deployment.
- Keep deployment readiness blocked on custom-domain DNS only.

Out of scope:

- Cloudflare DNS changes.
- Email-link capture.
