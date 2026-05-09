---
status: complete
completed: 2026-05-09
---

# Stitch Shell Parity Summary

Closed implementation drift between the saved BMH Institute Stitch screens and the production dashboard shell.

Updated:

- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/sidebar-nav.tsx`
- `src/components/ui/brand-lockup.tsx`
- `src/app/(dashboard)/layout.test.ts`
- `src/app/(dashboard)/sidebar-nav.test.tsx`

Changes:

- Restored Stitch-visible `Learn` and `Admin` sidebar section labels.
- Kept profile access in the topbar by removing `My Profile` from the learner sidebar.
- Added the topbar notification icon.
- Rendered the role pill from the actual `owner`, `admin`, or `learner` role.
- Matched the larger rounded-square brand mark from the saved Stitch screens.
- Updated shell tests so future changes protect the Stitch-visible contract.

Verification:

- `npm run test:rtl -- src/app/\(dashboard\)/sidebar-nav.test.tsx src/app/\(dashboard\)/layout.test.ts`
- `npm run verify`
