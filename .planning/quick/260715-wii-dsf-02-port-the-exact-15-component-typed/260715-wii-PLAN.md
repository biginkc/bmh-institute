---
quick_task: 260715-wii
title: DSF-02 design-system component library
type: execute
autonomous: true
branch: codex/design-system-02-components
files_modified:
  - src/components/bmh-ds/*.tsx
  - src/components/bmh-ds/*.test.tsx
  - src/components/bmh-ds/index.ts
  - src/app/design-system/page.tsx
must_haves:
  truths:
    - All 15 requested components are named TypeScript exports with public prop interfaces copied verbatim from the source declarations.
    - Rendered styles and interaction states match the source kit while using the DSF-01 collision-safe token names.
    - Andrea sprite defaults resolve from /brand/mascot and hard-coded glyphs use lucide-react.
    - The unlinked /design-system route renders every component in its main variants for screenshot QC without changing existing routes or navigation.
    - Button variants, Input error state, ProgressBar clamping, and LessonCard locked click behavior have RTL smoke coverage.
    - Verification and build pass and an open unmerged PR targets main.
  artifacts:
    - path: src/components/bmh-ds/
      provides: Fifteen one-component-per-file typed production components and barrel exports
    - path: src/components/bmh-ds/*.test.tsx
      provides: Required interaction and state regression coverage
    - path: src/app/design-system/page.tsx
      provides: Unlinked screenshot QC specimen surface
  key_links:
    - from: src/components/bmh-ds/*.tsx
      to: src/styles/bmh-ds/*.css
      via: Inline style values consume DSF-01 CSS variables including collision-safe --bmh names
    - from: src/components/bmh-ds/mascot.tsx
      to: public/brand/mascot/*.png
      via: Default /brand/mascot sprite base
    - from: src/app/design-system/page.tsx
      to: src/components/bmh-ds/index.ts
      via: Barrel imports render every production component
---

# DSF-02 design-system component library

## Goal

Port the source kit's 15 components into production TypeScript without changing an existing route. Add required RTL coverage and an unlinked specimen route. Push atomic commits and open the requested PR. Do not merge it.

## Source and constraints

- Canonical source: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/design system/`.
- The `.d.ts` prop interfaces are exact public API contracts. Do not add convenience props that are absent from those declarations.
- Port the `.jsx` DOM structure, inline styling, defaults, states, and behavior faithfully.
- Translate only DSF-01 collision mappings in component style references: `--radius-*`, `--shadow-*`, and `--ease-out` become their committed `--bmh-*` equivalents.
- Default `Mascot.base`, `Coach.base`, `Logo.base`, and `LessonCard.mascotBase` to `/brand/mascot`.
- Replace source hard-coded Lucide placeholders with icons from `lucide-react`. Keep caller-provided icon slots icon-agnostic.
- Use `"use client"` only for files that contain hooks or event behavior. Keep static rendering files server-compatible.
- Leave `/design-system` unlinked. Do not edit the production navigation or an existing route.
- No-merge gate: open the PR and stop.

## Test strategy

Write the four required RTL smoke cases before implementation. Assert all five Button variants render as buttons. Assert Input renders its error and danger border. Assert ProgressBar fill width and label clamp below 0 and above 100. Assert a locked LessonCard does not call its click handler while an unlocked card does.

<tasks>

<task id="1" title="Lock behavior and port the typed library">
  <files>src/components/bmh-ds/avatar.tsx, src/components/bmh-ds/badge.tsx, src/components/bmh-ds/button.tsx, src/components/bmh-ds/card.tsx, src/components/bmh-ds/icon-button.tsx, src/components/bmh-ds/progress-bar.tsx, src/components/bmh-ds/speech-bubble.tsx, src/components/bmh-ds/table.tsx, src/components/bmh-ds/input.tsx, src/components/bmh-ds/search-bar.tsx, src/components/bmh-ds/lesson-card.tsx, src/components/bmh-ds/chapter-item.tsx, src/components/bmh-ds/mascot.tsx, src/components/bmh-ds/coach.tsx, src/components/bmh-ds/logo.tsx, src/components/bmh-ds/index.ts, src/components/bmh-ds/*.test.tsx</files>
  <action>Add failing RTL smoke tests first. Then implement one kebab-case TSX file per component with the exact source prop interface and named export. Preserve source markup, inline styles, defaults, and state transitions. Apply only the documented DSF-01 token references, public mascot path defaults, and Lucide React glyph substitutions.</action>
  <verify>Run the focused RTL tests. Mechanically compare component inventory and prop interface declarations with the 15 source `.d.ts` files. Review all JSX differences against source and account for each one.</verify>
  <done>All 15 components compile, export through the barrel, preserve the public contracts, and pass the required smoke tests.</done>
</task>

<task id="2" title="Build the complete screenshot QC surface">
  <files>src/app/design-system/page.tsx</files>
  <action>Add an unlinked App Router page at `/design-system`. Recreate the core, forms, course, and brand specimen groups. Render main variants for every component and keep the page self-contained so existing routes and navigation do not consume the new library.</action>
  <verify>Run typecheck and build. Start the local app and inspect `/design-system` at desktop and narrow widths. Confirm every component is visible and no runtime or console error prevents QC.</verify>
  <done>The unlinked route gives reviewers one complete visual surface without changing current route output.</done>
</task>

<task id="3" title="Prove and deliver the unmerged PR">
  <files>All DSF-02 files, GSD artifacts, git commits, and PR metadata</files>
  <action>Run focused tests, `npm run verify`, `npm run build`, diff checks, and an adversarial manual review. Fix all valid findings. Record convergence evidence and obtain the required independent Claude verdict. Create coherent atomic commits, push the specified branch, and open the exact requested PR with all 15 components and deliberate deviations listed. Do not merge.</action>
  <verify>`npm run verify` and `npm run build` pass. `git diff --check` passes. GitHub reports an OPEN PR from `codex/design-system-02-components` to `main` with the requested title.</verify>
  <done>The requested open PR contains only DSF-02 and its verification artifacts and remains unmerged.</done>
</task>

</tasks>

## Final gate

Return the user's exact DONE verdict only after GitHub confirms the requested PR is open. Otherwise return the exact BLOCKED form with a concrete reason. Nothing in this plan authorizes merging.
