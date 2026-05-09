---
phase: 05-ecosystem-navigation-alignment
plan: 1
type: execute
depends_on:
  - v1-production-hardening-audit
files_modified:
  - src/app/(dashboard)/layout.tsx
  - src/app/(dashboard)/sidebar-nav.tsx
  - src/app/(dashboard)/sidebar-nav.test.tsx
  - src/components/page-header.tsx
requirements:
  - UI-02
  - UI-03
---

# Plan 05-1: Shared Dashboard Shell

## Objective

Replace the older BMH Institute dashboard shell with the shared BMH ecosystem shell pattern while preserving the LMS routes, permissions, data behavior, and sign-out/profile flows.

## User Value

BMH Institute should feel like part of the same internal app family as Sandra, Closer Lab, and Jitter. Users should not need to relearn navigation patterns when moving between BMH ecosystem tools.

## Implementation

1. Add focused tests for `SidebarNav`.
   - Admin users see Admin section links.
   - Learner users do not see Admin section links.
   - Pending submissions badge renders when count is positive.
   - Active link uses `data-active` or `aria-current` and the left-border class pattern.

2. Update `src/app/(dashboard)/layout.tsx`.
   - Use a fixed `h-16` topbar.
   - Make the brand area `md:w-64` with a right border.
   - Use a fixed desktop sidebar from `top-16` to bottom.
   - Offset main content by `pt-16 md:ml-64`.
   - Preserve `createClient`, auth redirect, profile lookup, `isAdmin`, pending submission count, profile link, and sign-out route.

3. Update `src/app/(dashboard)/sidebar-nav.tsx`.
   - Match Sandra and Closer Lab nav item style.
   - Use active left border instead of filled primary pill.
   - Keep BMH Institute route labels and hrefs.
   - Preserve pending submissions badge.
   - Add accessible primary nav semantics.

4. Add a shared `PageHeader` component.
   - Match the Sandra PageHeader API and styling.
   - Do not migrate every page in this first plan unless the change stays small.
   - Prefer using it on the highest-traffic dashboard/admin overview pages in a follow-up plan if needed.

5. Verify.
   - Run `npm run verify`.
   - Start local dev if needed.
   - Use the in-app browser or Chrome for visual inspection.
   - Use Playwright only where durable proof is useful.

## Acceptance Criteria

- Desktop shell has fixed 64px topbar and 256px sidebar.
- Active nav uses a 4px left border and no filled pill.
- Learner users cannot see admin links.
- Admin users can see all admin links and pending submission count.
- Profile and sign-out remain available from the topbar.
- Routes still render under the dashboard layout.
- No route permission changes are introduced.
- Browser verification confirms desktop and narrow viewport usability.

## Risks

- Mobile navigation can regress because the current sidebar is hidden on small screens. Keep a usable narrow viewport pattern in scope.
- Tests should not hard-code every Tailwind class. Assert stable user-visible behavior plus the key active-state contract.
- Do not copy Closer Lab admin shell exactly. Its admin shell is older than the shared Sandra-style fixed topbar/sidebar pattern.
