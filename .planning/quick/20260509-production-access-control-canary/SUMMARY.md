---
status: complete
completed: 2026-05-09
---

# Production access control canary

Completed production access-control hardening:

- Added production Supabase anon and signed-in user client helpers for disposable production users.
- Expanded `npm run test:prod:readiness` to verify assigned learner access through direct production RLS reads.
- Expanded the same canary to verify the unassigned learner cannot read assigned course, lesson, or submission rows.
- Added real production storage isolation checks for learner download, blocked cross-user download, and blocked cross-prefix upload.
- Updated the production-readiness assessment to mark access control and RLS isolation ready.

Verification:

- `npm run typecheck`
- `npm run test:prod:readiness`
- Direct production cleanup verification found 0 prefixed programs, courses, modules, lessons, role groups, assignments, quizzes, answer options, auth users, and root prefixed storage objects.
