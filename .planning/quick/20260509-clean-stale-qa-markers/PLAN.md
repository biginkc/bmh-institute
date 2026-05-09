# Stale QA Marker Cleanup Plan

## Goal

Remove stale QA wording left after the content/admin polish and seeded Playwright checks were merged.

## Scope

- Update merged PR references in the content/admin polish triage tracker.
- Mark the Phase 06 local Playwright blocker as resolved by CI-seeded Playwright while preserving the local env note.
- Run `npm run verify`.
