---
status: partial
phase: 01-auth-and-access-hardening
source: [01-VERIFICATION.md]
started: 2026-04-30T21:15:00Z
updated: 2026-04-30T21:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end admin route guard (HARDEN-01)
expected: Sign in as a learner. Navigate directly to `/admin/reports`, `/admin/reports/users/[any-id]`, `/admin/reports/courses/[any-id]`, `/admin/reports/programs/[any-id]`. Each navigation lands on `/dashboard` with no admin data visible.
result: [pending]

### 2. Expired invite full teardown (HARDEN-02 + CR-02)
expected: Generate a fresh invite via the admin Resend control. In Supabase, set its `expires_at` to `now() - interval '1 second'`. Click the invite link. (a) Land on `/login?error=invite_expired` with the copy "This invite link has expired. Ask your admin to send you a fresh one." (b) Cannot navigate to `/dashboard`. (c) The corresponding `auth.users` row no longer exists.
result: [pending]

### 3. Deleted user re-authentication rejection (HARDEN-03)
expected: Delete a test user via the admin UI. Sign in with that user's old credentials. Sign-in fails with an authentication error and `/dashboard` is unreachable.
result: [pending]

### 4. Learner cannot read cross-course answer options (HARDEN-04)
expected: Sign in as a learner with no role-group access to course X. Using the Supabase JS client or PostgREST with that learner's JWT, run `SELECT * FROM answer_options_public WHERE question_id IN (any question of course X) LIMIT 1`. Zero rows returned.
result: [pending]

### 5. Populate TEST_SUPABASE_* env vars and run integration suite
expected: Add `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` to `.env.test.local`. Remove the `describe.skip` from `src/app/(dashboard)/admin/users/[userId]/edit/actions.integration.test.ts`. Run `npm run test:integration`. Both `actions.integration.test.ts` and `answer-options-isolation.integration.test.ts` execute and pass.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
