---
phase: 01-auth-and-access-hardening
plan: 2
subsystem: auth
tags: [harden, invite-expiry, tdd, server-action]
dependency_graph:
  requires: []
  provides: [invite-expiry-enforcement, admin-resend-invite]
  affects: [auth-callback, login-page, admin-users]
tech_stack:
  added: []
  patterns: [discriminated-union-return, admin-client-acquisition, call-order-guard-test]
key_files:
  created:
    - src/app/auth/callback/route.test.ts
    - src/app/(dashboard)/admin/users/actions.test.ts
    - src/app/(dashboard)/admin/users/resend-invite-button.tsx
  modified:
    - src/app/auth/callback/route.ts
    - src/app/(auth)/login/page.tsx
    - src/app/(dashboard)/admin/users/page.tsx
    - src/app/(dashboard)/admin/users/actions.ts
decisions:
  - applyInvite exported with discriminated union return; expired check placed after accepted_at guard and before any role write (D-02)
  - Resend action mints new token and calls inviteUserByEmail; skips enrollment email re-send (D-03 default)
  - login page extends the existing ternary chain with invite_expired branch (D-01)
  - invite_expired badge uses destructive variant matching existing admin badge patterns
metrics:
  duration: "~4 minutes"
  completed: "2026-05-01"
  tasks_completed: 4
  files_changed: 7
---

# Phase 1 Plan 2: Invite Expiry Enforcement Summary

HARDEN-02 closed: `applyInvite` enforces `expires_at` before any role assignment; expired invite tokens redirect to `/login?error=invite_expired` with dedicated copy; admins can resend a fresh invite from the users list. Ten unit cases cover all branches.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Test inventory review (informational) | n/a |
| 2 | Failing tests for `applyInvite` (RED) | b0fe945 |
| 3 | Failing tests for `resendInvite` (RED) | be01f3d |
| 4 | Implementation: expiry check, login copy, admin resend | 5a7d5ad |

## What Was Built

`applyInvite` in `src/app/auth/callback/route.ts` now returns `{ ok: true } | { ok: false; reason: "expired" }` and is exported so the unit tests can import it. The expiry check compares `new Date(invite.expires_at) <= new Date()` and runs after the `!invite || invite.accepted_at` short-circuit but before any profile update or role-group insert. The GET handler branches on the result and redirects expired tokens to `/login?error=invite_expired`.

The login page extends the existing `urlError` ternary chain with a third branch for `invite_expired`, rendering: "This invite link has expired. Ask your admin to send you a fresh one."

The admin users page computes `isExpired` per row and renders a `<Badge variant="destructive">Expired</Badge>` in place of the countdown when the invite has passed. A `<ResendInviteButton>` sits alongside the existing `<RevokeInviteButton>`.

The new `resendInvite(inviteId)` server action follows the same shape as `inviteUser`: calls `requireAdmin()` first, acquires the admin client with try/catch, looks up the invite, guards against already-accepted invites, mints a fresh token with a new 14-day `expires_at`, updates the row, and re-fires `admin.auth.admin.inviteUserByEmail` with the new `redirectTo`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript compile error in route.test.ts mock fn signatures**
- **Found during:** Task 4 `npm run verify`
- **Issue:** `vi.fn(async () => ...)` with no parameters inferred zero-arg type; calling `profileUpdate(patch)` and `userRoleInsert(rows)` with arguments caused TS2554 errors.
- **Fix:** Changed mock declarations to `vi.fn(async (_patch: any) => ...)` and `vi.fn(async (_rows: any) => ...)` with `eslint-disable` comments for `@typescript-eslint/no-explicit-any`. The mock behavior is unchanged.
- **Files modified:** `src/app/auth/callback/route.test.ts`
- **Commit:** 5a7d5ad (included in implementation commit since the test file was already staged)

## TDD Gate Compliance

RED gate: `test(01-auth): HARDEN-02 failing regression for invite expiry` (b0fe945)
RED gate: `test(01-auth): HARDEN-02 failing regression for resendInvite admin action` (be01f3d)
GREEN gate: `feat(01-auth): HARDEN-02 enforce invite expiry and add admin resend` (5a7d5ad)

Both RED commits preceded the GREEN commit. All four `applyInvite` tests failed (TypeError: applyInvite is not a function) and all six `resendInvite` tests failed (TypeError: resendInvite is not a function) before the implementation commit.

## Verification Results

- `npm run test -- src/app/auth/callback`: 4 passed, 0 failed
- `npx vitest run "src/app/(dashboard)/admin/users/actions"`: 6 passed, 0 failed
- `npm run verify`: 84 passed, 0 failed (typecheck + all unit tests green)
- `grep "invite_expired" src/app/auth/callback/route.ts`: 1 match
- `grep "invite_expired" src/app/(auth)/login/page.tsx`: 1 match
- `grep 'reason: "expired"' src/app/auth/callback/route.ts`: 2 matches
- `grep "export async function resendInvite" src/app/(dashboard)/admin/users/actions.ts`: 1 match
- `resend-invite-button.tsx` exists and exports `ResendInviteButton`
- `grep "isExpired" src/app/(dashboard)/admin/users/page.tsx`: 2 matches

## Known Stubs

None. All data flows are wired: the expiry check reads from the real `invites.expires_at` column, the login page reads `urlError` from `useSearchParams()`, the admin users page computes `isExpired` from the invite row, and `resendInvite` calls `inviteUserByEmail` via the admin client.

## Threat Flags

No new threat surface beyond what is documented in the plan's `<threat_model>`. The three threats in the register (T-01-2-01, T-01-2-02, T-01-2-03) are all mitigated or accepted as documented.

## Notes for Manual Verification

Visit `/login?error=invite_expired` after deploy to confirm the copy renders: "This invite link has expired. Ask your admin to send you a fresh one."

The admin Resend flow cannot be fully exercised in local dev without a valid Supabase service-role key and a real invite row. Smoke-test on next deploy via `/admin/users` with an expired invite.

## Self-Check: PASSED

All 7 files verified present. All 3 task commits (b0fe945, be01f3d, 5a7d5ad) verified in git log.
