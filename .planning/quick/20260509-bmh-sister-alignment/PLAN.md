---
status: in-progress
created: 2026-05-09
branch: codex/20260509-bmh-sister-alignment
---

# BMH sister alignment foundation

Goal: begin aligning BMH Institute with the root sibling apps by consuming the shared Sandra Design System package and adopting its brand lockup pattern.

Scope for this first slice:

- Add regression coverage that checks BMH Institute depends on `@sandra/tokens` from `../Sandra Design System`.
- Replace the current neutral shadcn token set in `src/app/globals.css` with the shared package import used by Jitter and Closer Lab.
- Add the registry-style `BrandLockup` component locally and use it in the dashboard shell while preserving BMH Institute product copy.
- Run focused tests first to confirm they fail on current code, then implement and run `npm run verify`.

Out of scope:

- Sandra Practice voice runtime or role play work.
- Database or Supabase changes.
- Large navigation restructuring.
