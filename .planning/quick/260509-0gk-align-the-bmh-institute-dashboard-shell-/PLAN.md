---
status: in-progress
created: 2026-05-09
branch: codex/20260509-001855-bmh-sandra-shell-match
---

# Align BMH Institute dashboard shell with sibling apps

Goal: make the BMH Institute dashboard shell follow the Sandra and Closer Lab left nav and top header patterns.

Scope:

- Compare Sandra and Closer Lab shell components before editing.
- Keep the fixed 64px header and 256px left rail structure.
- Keep product-specific BMH copy and routes.
- Flatten the left rail nav to match sibling applications.
- Keep profile access in the primary rail rather than relying on a mobile-only header link.
- Remove the extra mobile-only horizontal nav strip.
- Add focused regression coverage for the shell contract.
- Run focused tests and `npm run verify`.

Out of scope:

- Sandra Practice voice runtime changes.
- Database or Supabase changes.
- Broad page content redesign.
