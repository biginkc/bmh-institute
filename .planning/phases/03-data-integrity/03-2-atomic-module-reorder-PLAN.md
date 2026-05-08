# Plan 03-2: Atomic Module Reorder

## Requirement

INTEG-02: Module reordering runs in a single Postgres function so a partial failure cannot leave a module with a negative `sort_order`, with an integration test that asserts ordering is consistent under simulated mid-sequence failure.

## Current Risk

`moveModule` uses three separate updates and a negative temporary sort value. A failure after the first update can leave `sort_order` corrupted.

## Implementation

1. Add a migration function that locks modules in the target course, finds the adjacent module, and swaps the two sort orders in one `UPDATE ... CASE` statement.
2. Guard the function with an admin check.
3. Update `moveModule` to call the RPC.
4. Remove app-side negative temporary sort handling.

## Verification

1. Add an integration test with a temporary failing trigger to simulate update failure, then assert no module has a negative `sort_order`.
2. Add or update a unit test proving `moveModule` calls the RPC and surfaces RPC errors.
3. Run targeted tests and `npm run verify`.

