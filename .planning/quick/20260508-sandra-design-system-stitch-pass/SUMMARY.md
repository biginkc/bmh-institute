---
status: complete
completed: 2026-05-08
---

# Sandra Design System Stitch Pass Summary

Status: completed on 2026-05-08

## Decision

BMH Institute uses the shared BMH ecosystem shell used by Sandra, Closer Lab, Jitter, and BMH Institute. The top nav and left nav should be identical across the ecosystem. Product name, icon, route labels, and user identity may change. Structure, dimensions, fixed positioning, active state, typography, spacing, and warm-paper surfaces should not drift.

## Stitch Project

- Project: `4322463408349379689`
- Design system: `assets/c2779ddbe4f84ff2b3e7ec7cd4049a0c`
- Local design contract: `/Users/jarradhenry/Sites/BMH Institute/.stitch/DESIGN.md`

## Artifacts

- Learner dashboard: `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-learner-dashboard/screen.html`
- Lesson view: `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-lesson-view/screen.html`
- Admin overview: `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-admin-overview/screen.html`
- Admin users: `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-admin-users/screen.html`

Each folder also includes `screen.png` and `render-1440.png`. Earlier generated versions are preserved as `*.v1.*` where a corrective pass was needed.

## Shell Contract

- Topbar: fixed 64px, warm paper background, bottom border.
- Brand area: 256px wide, right border, rounded-square primary mark, BMH Institute wordmark, `TRAINING PLATFORM` sub-label.
- User cluster: notification icon, switch-view link, `Jarrad Henry`, `OWNER` pill, sign out behind a left divider. No topbar avatar.
- Sidebar: fixed below topbar, 256px wide, warm paper background, right border.
- Sections: `LEARN` above Dashboard and Certificates, `ADMIN` above admin routes.
- Active state: 4px left border and foreground text only. No fill, no active pill.
- Footer: muted truncated `jarrad@bmhgroupkc.com`.

## Implementation Notes

- BMH Institute's current in-repo shell is older than the ecosystem contract. Future UI implementation should follow the Sandra and Closer Lab shell pattern rather than copying the current BMH shell.
- The PageHeader pattern should use uppercase breadcrumb, 24px title, muted description, and right-aligned actions on desktop.
- Cards should stay white with warm 1px borders, rounded-2xl corners, and no shadows.
