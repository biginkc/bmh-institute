# Sync role-play GSD state summary

Updated active GSD state to match the shipped role-play embed surface.

Evidence:

- `supabase/migrations/013_role_play_blocks.sql` adds `role_play` blocks and `role_play_results`.
- `src/lib/role-plays/embed-token.ts` mints short-lived embed tokens.
- `src/components/role-play-block.tsx` listens for trusted Closer Lab postMessage events.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx` includes role-play authoring support.
- `src/app/(dashboard)/lessons/[lessonId]/actions.ts` persists role-play results.
- `src/app/(dashboard)/admin/reports/users/[userId]/page.tsx` surfaces role-play results in user reports.
- Production-readiness run `25609474981` passed after deployment.
