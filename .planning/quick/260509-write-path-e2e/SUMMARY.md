---
status: complete
created: "2026-05-09T01:26:40-05:00"
---

# Write Path E2E

## Progress

- Started from GitHub issue #2 and Phase 04-4 deferred TEST-03 plan.
- Added non-production-only disposable Playwright fixtures and write-path specs.
- Updated the test environment runbook and TEST-03 planning notes to reflect the existing `bmh-institute-test` project and the new durable spec.

## Verification

- `npm run typecheck` passed after installing dependencies in this worktree.
- `npm run test -- src/app/globals.test.ts src/lib/rate-limit/ip.test.ts` passed.
- `npm run verify` passed.
- `npm run seed:e2e` is blocked locally because `.env.test.local` does not provide `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY`.
- PR CI `Verify` passed. The first seeded E2E failures reached the write-path spec and exposed overly broad strict-mode locators for duplicate revision status/note text; those assertions were narrowed to stable first-match checks on the learner lesson page.
- A later seeded E2E run exposed that the admin approval helper could select the wrong fixture-prefixed card after multiple submissions existed; the helper now targets the exact assignment title.
- Final PR #39 CI passed both `Verify` and `Seeded Playwright E2E`.

## Remaining

- Merge PR #39 after the final metadata-only sync check passes.
- Keep invite acceptance outside this issue until non-production email capture is stable.
