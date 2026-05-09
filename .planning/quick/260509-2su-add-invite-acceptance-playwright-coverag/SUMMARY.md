---
status: complete
created: "2026-05-09T02:01:00-05:00"
---

# Invite Acceptance Playwright Coverage

## Progress

- Started from the remaining GSD blocker: invite acceptance coverage deferred pending email capture.
- Chosen path: Supabase Admin `generateLink({ type: "invite" })` in the non-production test project, so Playwright can exercise the real invite callback and first password setup without reading an inbox.
- Added a disposable invite fixture and Playwright coverage for generated invite link, `/auth/callback`, first password setup, dashboard access, accepted invite state, active learner profile, and role-group assignment.
- First CI seeded E2E run exposed a real app gap: generated invite links return `access_token` and `refresh_token` in the URL hash, which the server callback cannot read. Added a browser-side login bridge plus `/auth/apply-invite` route so hash-token invite callbacks still apply the invite and land on first password setup.
- Second CI seeded E2E run passed the invite path and exposed a timing issue in the existing write-path approval helper. The helper now polls the exact assignment submission row for approved status before the learner page assertion.

## Verification

- `npm run test -- src/app/auth/callback/route.test.ts` passed.
- `npm run verify` passed, including 192 unit tests and 9 RTL tests.
- PR #40 CI passed both `Verify` and `Seeded Playwright E2E`.
