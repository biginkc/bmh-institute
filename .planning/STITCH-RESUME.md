# BMH Institute Stitch Resume

Date: 2026-05-09
Status: BMH Stitch artifacts exist. Current Codex session does not expose Stitch MCP tools.

## What is already done

- BMH Institute Stitch project exists: `4322463408349379689`.
- BMH Institute design system asset exists: `assets/c2779ddbe4f84ff2b3e7ec7cd4049a0c`.
- Local BMH design contract exists at `.stitch/DESIGN.md`.
- Four desktop screens are saved under `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/`:
  - `bmh-institute-learner-dashboard`
  - `bmh-institute-lesson-view`
  - `bmh-institute-admin-overview`
  - `bmh-institute-admin-users`

## Current limitation

This session does not have callable Stitch MCP tools in the active tool list. Do not claim a new Stitch generation or edit happened unless the Stitch MCP tool is actually available and returns a result.

If Stitch tools are unavailable:

1. Use the saved `screen.html` files as the review source.
2. Use Playwright or Chrome to re-render local HTML when needed.
3. Patch saved HTML only for deterministic recovery edits.
4. Keep the change documented in `.planning/STITCH-HANDOFF.md`.

## Next action

Open the four current BMH `screen.html` files in Chrome and review them against `.planning/STITCH-HANDOFF.md`.

If the user wants another screen, generate it in the BMH Stitch project when MCP is available. Recommended next screen:

`bmh-institute-admin-submissions`

Prompt anchor:

Use the BMH Institute design contract, the Sandra family Warm Paper / Organic Utility design system, fixed 64px topbar, fixed 256px left sidebar, active left-border nav state, PageHeader pattern, white rounded-2xl cards with warm borders, and no default shadows. The screen is an admin submissions review queue for BMH Group's internal training platform. It should show pending submissions, needs revision, approved history, learner/course filters, review notes, approve/request revision actions, and a compact evidence rail.

## Files to read first

- `.stitch/DESIGN.md`
- `.planning/STITCH-HANDOFF.md`
- `.planning/quick/20260508-sandra-design-system-stitch-pass/SUMMARY.md`
- `/Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md`
- `/Users/jarradhenry/Sites/Closer Lab/.planning/STITCH-HANDOFF.md`
