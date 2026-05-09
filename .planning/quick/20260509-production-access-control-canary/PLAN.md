---
status: in-progress
created: 2026-05-09
branch: codex/20260508-223400-access-control-canary
---

# Production access control canary

Goal: strengthen production-readiness validation for access control and RLS isolation using real production auth, database reads, storage reads, and storage writes.

Scope:

- Add production Playwright canary checks that sign in disposable learner-scoped Supabase clients.
- Prove the assigned learner can read assigned course and lesson rows.
- Prove the unassigned learner cannot read the assigned learner's course, lesson, or submission rows.
- Prove the unassigned learner cannot read the assigned learner's storage object.
- Prove the unassigned learner cannot write into the assigned learner's storage prefix.
- Update the production-readiness assessment with the new proof.

Out of scope:

- Invite email-link automation.
- Password reset email-link automation.
- Custom-domain DNS and rollback drill work.
