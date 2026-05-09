---
status: in-progress
created: 2026-05-09
branch: codex/20260508-223730-production-cleanup-runbook
---

# Production readiness recovery runbook

Goal: make interrupted production-readiness cleanup repeatable and auditable.

Scope:

- Add a production-ref guarded cleanup audit script for `PRD-READY-` fixtures.
- Make the script dry-run by default and require `--execute` for deletes.
- Add a runbook for failed or interrupted production-readiness runs.
- Update the production-readiness assessment once the runbook exists.

Out of scope:

- Email inbox capture.
- Password reset automation.
- Vercel rollback drill.
