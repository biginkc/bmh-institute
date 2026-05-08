# Phase 3 Context: Data Integrity

## Goal

Make the critical write paths transactional or server-validated so production data cannot be left partially updated by mid-operation failures or concurrent writes.

## Scope

- INTEG-01: Move `setUserRoleGroups` and `saveUserSettings` role-group rewrites into Postgres functions with transactional semantics.
- INTEG-02: Move module reordering into a Postgres function that swaps sort orders atomically without negative temporary values.
- INTEG-03: Replace race-prone certificate-number generation with a locked counter or equivalent atomic database primitive.
- INTEG-04: Reject assignment file submissions whose `submission_file_path` does not begin with the authenticated user's ID.

## Surfaces

- `src/app/(dashboard)/admin/users/actions.ts`
- `src/app/(dashboard)/admin/users/[userId]/edit/actions.ts`
- `src/app/(dashboard)/admin/courses/actions.ts`
- `src/app/(dashboard)/lessons/[lessonId]/assignment-actions.ts`
- `supabase/migrations/002_functions_and_triggers.sql`
- `supabase/migrations/012_data_integrity.sql`

## Test Strategy

- Unit-test server action behavior where rejection can be proven without a live database.
- Integration-test database atomicity against Supabase for transactional guarantees.
- Run `npm run verify` after implementation and targeted integration tests when the required Supabase env vars are present.

