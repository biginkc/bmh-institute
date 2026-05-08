---
phase: 02-content-safety-and-rate-limiting
plan: 3
subsystem: security
tags: [rate-limit, supabase, auth, password-reset, harden-06]

requires:
  - phase: 02-content-safety-and-rate-limiting
    provides: Phase 2 auth hardening context and testing parity
provides:
  - Postgres-backed auth rate-limit table and RPC
  - Server-side IP and email gates for forgot-password
  - Server-side IP and email gates for set-password
  - Unit and integration coverage for HARDEN-06 behavior
affects: [auth, password-reset, set-password, supabase-migrations]

tech-stack:
  added: []
  patterns: [security-definer-rpc, fail-closed-rate-limit, async-next-headers]

key-files:
  created:
    - src/lib/rate-limit/ip.ts
    - src/lib/rate-limit/ip.test.ts
    - src/lib/rate-limit/check.ts
    - src/lib/rate-limit/check.test.ts
    - src/lib/rate-limit/check.integration.test.ts
    - supabase/migrations/011_auth_rate_limits.sql
    - src/app/(auth)/forgot-password/actions.test.ts
    - src/app/auth/set-password/actions.test.ts
  modified:
    - src/app/(auth)/forgot-password/actions.ts
    - src/app/auth/set-password/actions.ts

key-decisions:
  - "Use the SECURITY DEFINER RPC pattern from 02-RESEARCH.md for atomic counter increments."
  - "Forgot-password breaches silently return ok true to preserve account-enumeration resistance."
  - "Set-password breaches return an explicit retry message because the user is already in a recovery session."
  - "Rate-limit helper fails closed if the RPC errors or returns no row."

patterns-established:
  - "Request IP extraction is a pure helper tested independently from Next headers()."
  - "Server actions call await headers() because Next 16 keeps headers() async."
  - "Auth-adjacent rate limits gate before Supabase auth mutations."

requirements-completed: [HARDEN-06]

duration: 17min
completed: 2026-05-08
---

# Phase 02 Plan 3: Password Reset Rate Limit Summary

**Postgres-backed per-IP and per-email rate limits before forgot-password and set-password auth calls**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-08T20:49:00Z
- **Completed:** 2026-05-08T21:06:39Z
- **Tasks:** 5
- **Files modified:** 10

## Accomplishments

- Added `auth_rate_limits` and `fn_check_and_consume_rate_limit` in migration `011`.
- Added pure IP extraction with Vercel and proxy header fallbacks.
- Added `checkAndConsume` service-role RPC helper that fails closed.
- Gated forgot-password by IP and normalized email before `resetPasswordForEmail`.
- Gated set-password by IP and authenticated user email before `updateUser`.

## Task Commits

1. **Failing tests:** `9a5a84f` test(phase-02): add failing auth rate-limit coverage
2. **Implementation:** this commit, feat(phase-02): rate limit password reset paths

## Files Created/Modified

- `supabase/migrations/011_auth_rate_limits.sql` - Rate-limit enum, table, RLS, index, trigger, and service-role-only RPC.
- `src/lib/rate-limit/ip.ts` - Request IP extraction helper.
- `src/lib/rate-limit/ip.test.ts` - Unit coverage for forwarded header precedence and fallback.
- `src/lib/rate-limit/check.ts` - Service-role RPC wrapper with fail-closed behavior.
- `src/lib/rate-limit/check.test.ts` - Unit coverage for RPC params, camelCase normalization, and failure modes.
- `src/lib/rate-limit/check.integration.test.ts` - Integration coverage for threshold denial, key-type isolation, and retry-after values.
- `src/app/(auth)/forgot-password/actions.ts` - Silent rate-limit gate before reset email.
- `src/app/(auth)/forgot-password/actions.test.ts` - Unit coverage for gate ordering and silent breach behavior.
- `src/app/auth/set-password/actions.ts` - Explicit rate-limit gate before password update.
- `src/app/auth/set-password/actions.test.ts` - Unit coverage for validation ordering, retry messages, and success redirect.

## Decisions Made

- Used `await headers()` per the local Next 16 docs in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md`.
- Used opportunistic prune inside the RPC instead of scheduled cleanup.
- Kept rate limits as constants inside the two auth actions because the phase scope has exactly two call sites.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The first red test draft had Vitest hoisting issues in mocked `next/headers` and `next/navigation`; fixed before committing red tests.
- Integration test skipped locally because `.env.test.local` does not include `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY`.

## User Setup Required

Apply `supabase/migrations/011_auth_rate_limits.sql` before deploying the code path. To run the integration test, populate `.env.test.local` with `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY`, apply the migration, then run:

```bash
npm run test:integration -- src/lib/rate-limit/check.integration.test.ts
```

## Next Phase Readiness

Phase 2 is implementation-complete. The next GSD step is phase verification, then Phase 3 data integrity.

---
*Phase: 02-content-safety-and-rate-limiting*
*Completed: 2026-05-08*
