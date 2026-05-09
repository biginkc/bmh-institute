# Issue 6 Content and Admin Polish Triage

Date: 2026-05-08
Environment: production deployment `sandra-university-muv2z3cz7-jarrad-5416s-projects.vercel.app`

## Scope

Browser walkthrough for GitHub issue #6 after the ecosystem shell merge and production deploy.

Temporary admin and learner users were created for the walkthrough and deleted afterward.

Screenshots were captured under `test-results/polish-triage/` and are intentionally not committed.

## Findings

### P1: Admin user and invite tables are clipped on narrow viewports

Status: fixed in PR pending for `codex/20260509-admin-users-responsive-tables`.

URLs:

- `/admin/users`

Evidence:

- Desktop `Active members` table clips the right-side role/status content inside the card at 1440px.
- Mobile users page clips table content horizontally. The role/status columns and invite actions are partially unreachable without an explicit horizontal scroll container.
- Pending invites table also clips on mobile.

Expected:

- Dense tables remain scannable on desktop.
- Mobile either uses a horizontal scroll container with clear overflow behavior or switches to stacked rows.

Recommended fix:

- Wrap admin tables in `overflow-x-auto`.
- Set sensible min widths for table content.
- Consider stacked mobile cards later if the table still feels cramped.

Resolution:

- Added explicit page-level scroll wrappers for pilot setup, active members, and pending invites tables.
- Increased active members and pending invites minimum table widths.
- Added `src/app/(dashboard)/admin/users/page.test.ts` coverage that asserts the dense tables render named horizontal scroll regions.
- Verified with focused page tests and `npm run verify`.

### P1: Learner empty state is technically correct but not operationally helpful

URL:

- `/dashboard`

Evidence:

- A learner with no assigned programs sees `No programs yet` and generic admin-contact copy.

Expected:

- Internal users should know what to do next without guessing who the admin is.

Recommended fix:

- Add clearer empty-state copy for internal BMH users.
- Consider showing `Contact your BMH Institute admin` plus a configured support/admin email if the app has one.
- Keep it simple. Do not add a request-access workflow unless Jarrad asks for it.

### P2: Admin reports show raw system activity that is hard to scan

URL:

- `/admin/reports`

Evidence:

- Recent activity renders repeated `System` rows with terse messages.
- The section works, but it is not yet a high-signal admin summary.

Expected:

- Admin can quickly understand who did what, which course/program it affected, and whether action is needed.

Recommended fix:

- Group or label system activity more clearly.
- Add stronger empty/summary states.
- Consider suppressing low-value system rows or moving them below learner-facing activity.

### P2: Admin overview is sparse after shell alignment

URL:

- `/admin`

Evidence:

- Overview has useful stat cards and quick actions, but the page has large unused space and does not point admins toward the next operational action beyond New program/New course.

Expected:

- For a small internal LMS, overview should guide admins toward pending submissions, stale invites, learner progress, and content gaps.

Recommended fix:

- Add a compact `Needs attention` band.
- Surface pending invites or learners with no assigned program if cheap to query.
- Keep the page lightweight. Avoid building analytics-heavy reports here.

### P2: Authoring list pages are functional but low-context

URLs:

- `/admin/programs`
- `/admin/courses`

Evidence:

- Lists render cleanly but show minimal metadata.
- Program rows do not show course count or assigned learner scope.
- Course rows do not show module/lesson count.

Expected:

- Admin can scan whether content is complete enough to publish or maintain.

Recommended fix:

- Add lightweight counts where existing queries make this cheap.
- Defer heavier joins or RPCs unless performance remains acceptable.

## Recommended Execution Order

1. Fix responsive table overflow on `/admin/users`.
2. Improve learner empty state copy on `/dashboard`.
3. Improve admin overview needs-attention signals.
4. Improve reports recent activity readability.
5. Add lightweight content counts to program/course lists if query scope stays small.

## Verification To Reuse

- `npm run verify`
- Browser smoke with admin and learner users:
  - `/admin/users` desktop and mobile
  - `/dashboard` learner with no assignments
  - `/admin`
  - `/admin/reports`
  - `/admin/programs`
  - `/admin/courses`
