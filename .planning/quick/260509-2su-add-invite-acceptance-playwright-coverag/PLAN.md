---
status: complete
created: "2026-05-09T02:01:00-05:00"
---

# Invite Acceptance Playwright Coverage

## Goal

Close the remaining invite acceptance verification gap without relying on an email inbox.

## Scope

- Add a non-production-only invite fixture that creates a disposable role group, program, invite row, and Supabase invite action link.
- Drive the real browser through the Supabase invite action link into `/auth/callback`.
- Verify first password setup redirects to the learner dashboard.
- Verify the invite row is marked accepted, the learner profile is active, role-group access is applied, and the disposable program appears.
- Keep the fixture guarded against the production Supabase ref.

## Verification

- `npm run verify`
- PR CI `Seeded Playwright E2E`
