# BMH Institute Stitch Design Handoff

Last updated: 2026-05-09
Status: 4 desktop screens generated and saved
Working mode: Stitch design loop feeds implementation. BMH app code should follow these screens and the shared shell contract.

## Quick start

If you are picking this up in a fresh agent session:

1. Use `.stitch/DESIGN.md` as the local BMH design contract.
2. Use `/Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md` as the canonical Sandra family design system.
3. Open the current `screen.html` files listed below in Chrome before judging the design.
4. Compare implementation against the actual HTML render, not against the 512px Stitch thumbnail or a markdown-only description.
5. Keep BMH Institute separate from Sandra Practice. Voice role play runtime belongs outside this repo.

## Current state

The BMH Institute Stitch pass was completed as Phase 2.5. It created a dedicated BMH Institute Stitch project and four desktop screens.

| Screen | Slug | State | Local review file |
|---|---|---|---|
| Learner dashboard | `bmh-institute-learner-dashboard` | Current | `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-learner-dashboard/screen.html` |
| Lesson view | `bmh-institute-lesson-view` | Current | `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-lesson-view/screen.html` |
| Admin overview | `bmh-institute-admin-overview` | Current | `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-admin-overview/screen.html` |
| Admin users | `bmh-institute-admin-users` | Current | `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-admin-users/screen.html` |

Each folder also has `screen.png` and `render-1440.png`. Some folders preserve earlier versions as `*.v1.*`.

## Stitch resources

| Resource | Value |
|---|---|
| BMH Institute Stitch project | `projects/4322463408349379689` |
| BMH Institute design system asset | `assets/c2779ddbe4f84ff2b3e7ec7cd4049a0c` |
| Local BMH design contract | `/Users/jarradhenry/Sites/BMH Institute/.stitch/DESIGN.md` |
| Canonical Sandra family contract | `/Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md` |
| Artifact folder root | `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/` |

## Sibling app convention to follow

Closer Lab and Sandra Design System use this pattern:

- Keep project-specific `.stitch/DESIGN.md` in the app repo.
- Store generated HTML and screenshots under the Sandra Design System `.stitch/designs/` folder.
- Use `screen.html` as the real review surface.
- Save `screen.png` and `render-1440.png` beside the HTML.
- Archive previous generated versions as `screen.v1.html`, `screen.v1.png`, and `render-1440.v1.png` before replacing them.
- Open the HTML in Chrome after every generation or edit.

## Locked BMH shell contract

BMH Institute must use the shared Sandra family shell, not a one-off LMS shell.

Topbar:

- Fixed full-width topbar.
- Height 64px.
- Warm paper background.
- Bottom border.
- Left brand area spans the 256px sidebar column and has a right border.
- Brand mark is a rounded square, not a circle.
- Wordmark is `BMH Institute`.
- Sub-label is `Training Platform`.
- Right side has notification icon, user name, uppercase role pill, optional switch-view link, and Sign out behind a desktop divider.

Sidebar:

- Fixed desktop sidebar starts below the topbar.
- Width is 256px.
- Surface is warm paper with right border.
- Active nav is a 4px left border with foreground text. No fill and no active pill.
- Inactive nav uses muted text and warm muted hover fill.
- Footer shows only the muted truncated user email.

Navigation:

- Learn: Dashboard, Certificates.
- Admin: Overview, Programs, Courses, Users, Submissions, Role groups, Reports.

Page header:

- Uppercase breadcrumb.
- 24px bold title with tight line-height and slight negative tracking.
- 14px muted description.
- Right-aligned actions on desktop.

Cards:

- White card surface.
- Warm 1px border.
- Rounded-2xl corners.
- No default shadows.
- Dense but humane spacing.

## Workflow for the next Stitch screen

1. Start from `.stitch/DESIGN.md` and this handoff.
2. Build a detailed prompt that includes the locked shell contract and screen-specific content.
3. Generate or edit through Stitch MCP when available.
4. Save the result under `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-{slug}/`.
5. Save `screen.html`, `screen.png`, and `render-1440.png`.
6. Open `screen.html` in Chrome.
7. Audit against the actual render before reporting back.

## Recommended next screens

The first four screens cover the main learner and admin surfaces. The next useful screens are:

1. Admin submissions review queue.
2. Admin reports and pilot monitoring.
3. Program detail and course authoring.
4. Mobile learner dashboard.

Do not generate role-play runtime screens in this repo. Those belong to Sandra Practice or Closer Lab depending on the product direction.
