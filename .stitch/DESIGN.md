---
name: BMH Institute Sandra Design System
description: BMH Institute adaptation of the shared BMH ecosystem Warm Paper / Organic Utility shell.
project_id: 4322463408349379689
source_of_truth: /Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md
last_synced: 2026-05-08
colors:
  background: "#fdfcfb"
  foreground: "#1c1917"
  card: "#ffffff"
  card_foreground: "#1c1917"
  primary: "#111827"
  primary_foreground: "#ffffff"
  muted: "#f5f5f4"
  muted_foreground: "#78716c"
  border: "#e5e1df"
  input: "#e5e1df"
  destructive: "#ba1a1a"
typography:
  sans: Inter
  mono: Geist Mono
  page_title: "24px / 700 / tight / -0.02em"
  body: "15px / 500 / 1.6"
  label_caps: "10-11px / 700 / uppercase / tracking-widest"
layout:
  topbar_height: 64px
  sidebar_width: 256px
  desktop: "fixed topbar, fixed left sidebar, content offset by topbar and sidebar"
  mobile: "topbar plus collapsed navigation pattern, no persistent sidebar"
---

# BMH Institute Stitch Design Contract

BMH Institute uses the shared BMH ecosystem visual language: Organic Utility / Warm Paper. The app is an internal training platform for BMH Group VAs and admins. It should feel calm, practical, premium, and operational. It should not feel like a marketing site, generic SaaS template, or education startup landing page.

The top navigation and left navigation must be identical to the other BMH ecosystem apps. "Identical" means the same structure, dimensions, positioning, active states, typography, spacing, surface treatment, and interaction styling. Only the product identity, icon, user identity, and route labels change.

## Source Order

1. Sandra Design System canonical file: `/Users/jarradhenry/Sites/Sandra Design System/.stitch/DESIGN.md`
2. Sandra CRM production shell: `/Users/jarradhenry/Sites/Sandra/src/app/(dashboard)/layout.tsx`
3. Sandra CRM sidebar: `/Users/jarradhenry/Sites/Sandra/src/components/dashboard-sidebar.tsx`
4. Closer Lab Stitch handoff: `/Users/jarradhenry/Sites/Closer Lab/.planning/STITCH-HANDOFF.md`
5. Closer Lab member shell: `/Users/jarradhenry/Sites/Closer Lab/src/components/member/MemberTopbar.tsx` and `/Users/jarradhenry/Sites/Closer Lab/src/components/member/MemberSidebar.tsx`
6. Jitter Stitch design contract: `/Users/jarradhenry/Sites/Jitter/.stitch/DESIGN.md`
7. Current BMH Institute app routes and IA in `/Users/jarradhenry/Sites/BMH Institute/src/app/(dashboard)/`

When sources disagree, use the Sandra Design System for tokens, Sandra CRM and Closer Lab member shell for topbar/sidebar behavior, and BMH Institute for product language and navigation labels. BMH Institute's current in-repo shell is older and should not override the ecosystem pattern.

## Visual Direction

- Warm off-white page canvas, not cool gray.
- Ink-on-paper primary color.
- Tonal layering through white cards, warm borders, and muted bands.
- No default shadows on cards.
- No gradients, glassmorphism, neon accents, blue-gray enterprise palettes, or oversized hero treatments.
- Dense but humane layouts. BMH Institute is an internal work tool and course platform, not a landing page.
- Cards use rounded-2xl, 1px warm border, white surface, and 24px horizontal / 20px vertical padding.
- Buttons are pill shaped when they are commands. Dense icon controls may be compact.

## Required Shell

This shell must match Sandra, Closer Lab, Jitter, and BMH Institute ecosystem expectations. It is not a new BMH-only shell.

Topbar:
- Fixed full-width topbar, height 64px.
- Class pattern should mirror: `border-border bg-background fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b pr-6 md:pr-8`.
- Left brand area spans the sidebar column: `md:w-64 md:border-r`.
- Brand mark is a rounded square, not a circle.
- Brand text:
  - Wordmark: `BMH Institute`
  - Sub-label: `Training Platform`
- Right side includes the current user identity and sign out. Keep it austere.
- Right-side user cluster mirrors Closer Lab member topbar: notification icon, display name, uppercase role pill, optional switch-view link when relevant, and ghost Sign out button separated by a left border on desktop.

Sidebar:
- Fixed desktop sidebar starts below the topbar.
- Width is 256px.
- Surface is `bg-background` with `border-r border-border`.
- Base nav item: `flex items-center gap-3 py-3 text-sm font-bold tracking-wide`.
- Active nav state is a 4px left border, no fill, no pill: `text-foreground border-l-4 border-foreground pl-4`.
- Inactive nav state is muted text with warm hover fill: `text-muted-foreground hover:bg-muted hover:text-foreground pl-5`.
- Footer shows the user email as muted truncated text only.
- Do not use filled active states, rounded active pills, standalone card sidebars, or a 56px admin-only topbar. Those are older or secondary patterns and should not drive BMH Institute screens.

BMH Institute nav:
- Learn section:
  - Dashboard
  - Certificates
- Admin section for admins:
  - Overview
  - Programs
  - Courses
  - Users
  - Submissions
  - Role groups
  - Reports

## Page Header

Use the Sandra PageHeader pattern:
- Breadcrumb above the title in 10px uppercase tracking-widest muted text.
- Title is 24px bold, tight line-height, -0.02em tracking.
- Description is 14px muted text, max width around 3xl.
- Actions sit to the right of the title row on desktop.

Do not use 40px hero titles inside authenticated app screens.

## BMH Screen Priorities

Start with desktop screens:
- Learner dashboard: training progress, assigned courses, next lesson, certificates.
- Lesson view: course context, lesson content, progress, quiz or assignment action.
- Admin overview: programs, learners, pending submissions, completion health.
- Admin users: user list, role groups, status, invite action.

Save artifacts under `/Users/jarradhenry/Sites/Sandra Design System/.stitch/designs/bmh-institute-{screen-slug}/` with:
- `screen.html`
- `screen.png`
- `render-1440.png`

Open every generated or edited `screen.html` in Chrome before reporting back.
