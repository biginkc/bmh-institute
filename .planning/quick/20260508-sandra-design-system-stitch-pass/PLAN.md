---
status: completed
created: 2026-05-08
scope: design
---

# Sandra Design System Stitch Pass

Goal: bring BMH Institute into the Sandra product family visual system before Phase 3 continues.

## Context

- BMH Institute is the internal training platform, not Sandra Practice.
- Phase 2 is deployed and verified.
- Phase 3 is the next hardening phase, but the UI shell should be aligned first so future work lands against the right patterns.
- Sibling references:
  - `/Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md`
  - `/Users/jarradhenry/Sites/Closer Lab/.stitch/DESIGN.md`
  - `/Users/jarradhenry/Sites/Closer Lab/.planning/STITCH-HANDOFF.md`
  - `/Users/jarradhenry/Sites/Jitter/.stitch/DESIGN.md`
  - `/Users/jarradhenry/Sites/Sandra/src/app/(dashboard)/layout.tsx`
  - `/Users/jarradhenry/Sites/Sandra/src/components/dashboard-sidebar.tsx`
  - `/Users/jarradhenry/Sites/Closer Lab/src/components/member/MemberTopbar.tsx`
  - `/Users/jarradhenry/Sites/Closer Lab/src/components/member/MemberSidebar.tsx`

## Locked Shell Decision

BMH Institute must use the same left nav and top nav shell as the broader BMH ecosystem: Sandra, BMH Institute, Closer Lab, and Jitter. Only product identity, icon, user identity, and route labels may change. Dimensions, fixed positioning, active nav treatment, typography, spacing, and warm-paper surfaces should match.

## Plan

1. Create BMH Institute's Stitch design contract from the Sandra Design System and sibling handoffs.
2. Create a dedicated BMH Institute Stitch project, not a screen inside another app's project.
3. Attach a Sandra-family design system to that project.
4. Generate desktop screens for the BMH shell and key surfaces:
   - learner dashboard
   - lesson view
   - admin overview
   - admin users
5. Save generated artifacts under `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-*`.
6. Open generated `screen.html` files in Chrome after every generation or edit.
7. Use the in-app browser or Chrome for visual review. Add Playwright only when behavior needs repeatable regression proof.

## Acceptance

- BMH Institute has a local `.stitch/DESIGN.md`.
- Stitch screens use the Sandra fixed topbar, left sidebar, PageHeader pattern, warm paper palette, and active-nav left border.
- Generated HTML and screenshots are saved using the Stitch folder convention.
- The user can review the generated screen HTML in Chrome.

## Result

- Created BMH Institute Stitch project `4322463408349379689`.
- Created project design system asset `assets/c2779ddbe4f84ff2b3e7ec7cd4049a0c`.
- Generated and audited four desktop screens:
  - learner dashboard
  - lesson view
  - admin overview
  - admin users
- Saved current HTML and screenshots under `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-*`.
- Opened each current `screen.html` in Chrome for review.
- Manually tightened exported HTML where Stitch missed shell parity or omitted required content.
