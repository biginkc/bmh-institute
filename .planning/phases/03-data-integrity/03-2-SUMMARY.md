# Summary 03-2: Atomic Module Reorder

## Completed

- Added `fn_move_module(p_module_id, p_course_id, p_direction)` in migration 012.
- The function locks the current module and adjacent module, then swaps sort orders in one `UPDATE ... CASE` statement.
- Removed app-side negative temporary `sort_order` writes from `moveModule`.
- Updated `moveModule` to call the database function and surface RPC errors.

## Verification

- Unit coverage:
  - `src/app/(dashboard)/admin/courses/actions.test.ts`
- Linked Supabase verification:
  - Created rollback-only course/module rows.
  - Moved a module through the RPC.
  - Simulated an error with a missing module.
  - Confirmed no module had negative `sort_order`.

