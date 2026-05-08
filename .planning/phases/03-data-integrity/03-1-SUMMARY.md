# Summary 03-1: Atomic Role Group Rewrite

## Completed

- Added `fn_set_user_role_groups(p_user_id, p_role_group_ids)` in migration 012.
- Added `fn_save_user_settings(p_user_id, p_system_role, p_status, p_role_group_ids)` in migration 012.
- Both functions require an authenticated admin via `public.is_admin(auth.uid())`.
- Updated `setUserRoleGroups` to call `fn_set_user_role_groups`.
- Updated `saveUserSettings` to call `fn_save_user_settings` after computing enrollment-email diffs.

## Verification

- Unit coverage:
  - `src/app/(dashboard)/admin/users/actions.test.ts`
  - `src/app/(dashboard)/admin/users/[userId]/edit/save-settings.test.ts`
- Linked Supabase verification:
  - Simulated insert failure with an invalid role group ID.
  - Confirmed the original `user_role_groups` row remained after the failed rewrite.

