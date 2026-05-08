# Plan 04-1: Supabase Generated Types

## Requirement

TYPE-01: Supabase types are generated via `supabase gen types` and the generated `Database` type is wired into the Supabase client, with all `as string` / `as number` / `as boolean` assertions on Supabase results removed across the report and lesson pages.

## Implementation

1. Generate `src/lib/supabase/types.ts` from project `dhvfsyteqsxagokoerrx`.
2. Wire `Database` into browser, server, middleware, and admin Supabase clients.
3. Remove targeted assertions from lesson and report pages by relying on typed query results or local shaper types.
4. Keep broader assertion cleanup outside report and lesson pages only if it is required for typecheck.

## Verification

1. `npm run typecheck`
2. `npm run verify`
3. `rg "as string|as number|as boolean" src/app/\\(dashboard\\)/lessons src/app/\\(dashboard\\)/admin/reports`

