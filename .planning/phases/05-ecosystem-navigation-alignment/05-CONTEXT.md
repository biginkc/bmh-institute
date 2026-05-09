# Phase 5 Context: Ecosystem Navigation Alignment

## Goal

Implement the shared BMH ecosystem dashboard shell in BMH Institute production UI.

The shell should match Sandra, Closer Lab, Jitter, and the BMH Institute Stitch pass while preserving BMH Institute routes, permissions, learner/admin behavior, and data queries.

## Source References

Use these references in order:

1. `/Users/jarradhenry/Sites/BMH Institute/.stitch/DESIGN.md`
2. `/Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md`
3. `/Users/jarradhenry/Sites/Sandra/src/app/(dashboard)/layout.tsx`
4. `/Users/jarradhenry/Sites/Sandra/src/components/dashboard-sidebar.tsx`
5. `/Users/jarradhenry/Sites/Sandra/src/components/page-header.tsx`
6. `/Users/jarradhenry/Sites/Closer Lab/src/components/member/MemberSidebar.tsx`
7. `/Users/jarradhenry/Sites/Closer Lab/src/components/member/MemberTopbar.tsx`
8. `/Users/jarradhenry/Sites/Jitter/.stitch/DESIGN.md`

Read sibling repos for reference only. Do not write to sibling repos.

## Functional Scope

Implement:

- Fixed 64px topbar.
- Brand area aligned to the sidebar column.
- 256px desktop sidebar under the topbar.
- Warm paper background and warm border treatment.
- Active nav with 4px left border.
- No filled active nav pills.
- Learner nav: Dashboard and Certificates.
- Admin nav: Overview, Programs, Courses, Users, Submissions, Role groups, Reports.
- Admin nav remains visible only for `owner` and `admin`.
- Pending submissions badge remains visible for admins.
- Right-side user identity remains visible.
- Sign-out continues to post to the existing sign-out route.
- Profile access remains available.
- Mobile and narrow viewport navigation remains usable.

Preserve:

- `DashboardLayout` auth redirect behavior.
- Existing `isAdmin` logic.
- Existing pending submissions count query.
- Existing route labels and hrefs unless the route does not exist.
- Existing route permissions and admin layout behavior.
- Existing page data fetching.

## Design Scope

Use the Sandra PageHeader pattern where practical:

- Breadcrumb above title in uppercase muted label text.
- 24px bold page title.
- 14px muted description.
- Right-aligned action slot on desktop.

Do not convert authenticated app pages into landing pages. Keep operational density.

## Test Intent

Before implementation, add focused tests for shell behavior:

- Sidebar active state uses left-border pattern and no filled primary active class.
- Learner users do not see admin navigation.
- Admin users see admin navigation and pending submissions badge.
- Sign-out form posts to the existing sign-out route.
- Topbar/sidebar shell landmarks are discoverable by accessible labels or stable text.

After implementation, verify with browser automation:

- Desktop admin dashboard.
- Desktop learner dashboard.
- Mobile or narrow viewport navigation state.
- At least one admin sub-route active state.
- At least one learner route active state.

## Out of Scope

- New LMS features.
- Role-play embed work.
- Sandra Practice voice runtime.
- Durable write-path Playwright issue #2.
- Rewriting page data queries unrelated to shell presentation.
