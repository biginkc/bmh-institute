# Plan 04-2: Unit Coverage Gaps

## Requirement

TEST-01: Vitest unit coverage added for auth callback flow, assignment submission action, admin review actions, forgot-password, and set-password actions.

## Current Coverage

- Auth callback coverage exists.
- Assignment submission coverage exists.
- Forgot-password coverage exists.
- Set-password coverage exists.
- Admin review action coverage is missing.

## Implementation

1. Inspect `src/app/(dashboard)/admin/submissions/actions.ts`.
2. Add focused unit tests for approve, reject, revision, or review mutations present in that file.
3. Mock `requireAdmin`, Supabase client calls, email sends if present, and revalidation.

## Verification

1. Targeted Vitest run for the new admin submissions action test.
2. `npm run verify`

