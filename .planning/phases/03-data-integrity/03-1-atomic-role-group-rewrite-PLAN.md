# Plan 03-1: Atomic Role Group Rewrite

## Requirement

INTEG-01: `setUserRoleGroups` and `saveUserSettings` rewrite `user_role_groups` inside a Postgres function with transactional semantics, with an integration test that simulates an insert failure and asserts the original rows are preserved.

## Current Risk

Both actions delete existing `user_role_groups` rows before inserting replacements. If the insert fails, the user can be left with no role-group access.

## Implementation

1. Add a migration function for role-group-only rewrites.
2. Add a migration function for profile role/status plus role-group rewrites.
3. Guard both functions with an admin check so direct RPC calls cannot bypass app authorization.
4. Update `setUserRoleGroups` to call the role-group rewrite RPC.
5. Update `saveUserSettings` to call the profile-plus-groups RPC.

## Verification

1. Add an integration test that starts with an existing group, calls the RPC with an invalid group ID, expects an error, and verifies the original group remains.
2. Add or update unit tests proving the server actions call the RPCs after `requireAdmin()`.
3. Run targeted tests and `npm run verify`.

