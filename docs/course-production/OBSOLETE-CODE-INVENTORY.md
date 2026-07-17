# Obsolete-code inventory and deletion gates

Updated: 2026-07-16

This is an evidence inventory, not deletion authorization. The walkthrough and
compatibility cleanup may land only after the real manifest passes the draft
canary and complete unpublished import. Authentication, audit history, reusable
learning features, and any unexplained live reference remain outside the
deletion boundary.

## Proven cleanup candidates

- The hard-coded BMH demo consists of the `seed:walkthrough` package command,
  `scripts/seed-walkthrough-onboarding.ts`, `src/lib/walkthrough/curriculum.ts`,
  `src/lib/walkthrough/bmh-demo.ts`, the walkthrough caption overlay and its
  root-layout mount. These references are isolated from the real manifest
  importer. Remove them only after the real draft proves the replacement path.
- `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` have no source
  imports. Current module and lesson ordering uses explicit up/down controls.
  They are candidates for package removal after a clean install and editor UAT.
- The legacy UI primitives `badge`, `brand-lockup`, `dialog`, `dropdown-menu`,
  `input`, `select`, `separator`, `sheet`, `skeleton`, and `table` under
  `src/components/ui` have no imports outside their own files. They are
  candidates for deletion after a full import scan and build.
- The nonfunctional header notification bell has been removed in the current
  branch. It is no longer presented as a working learner feature.
- Header lesson search is now access-scoped and keyboard accessible on desktop
  and mobile. The search primitives are active code and are not deletion
  candidates.
- Admin reports, exports, access setup, and helper modules still use pilot
  terminology. Rename their user-facing language to learner/cohort terminology
  without removing the underlying reusable monitoring and access behavior.

## Explicit retain decisions

- Avatar UI is active in desktop and mobile dashboard navigation. Retain it and
  the profile field unless a separate data migration proves the field unused.
- `passing_score` is active in authoring, import, learner rendering, and
  server-side scoring. Retain it.
- Sonner notifications are active across learner and admin forms. Its theme
  adapter and `next-themes` dependency require a separate runtime review rather
  than zero-import deletion.
- Program/course access, both certificate scopes, assignment modes, all media
  block types, reporting, email, Sandra integration, Closer Lab integration,
  and test-fixture infrastructure remain reusable platform features.
- Historical migrations are append-only evidence. Cleanup uses a new migration;
  it does not rewrite migrations that have already reached a shared database.

## Required proof before deletion

1. The complete real manifest reconciles in the unpublished QA hierarchy.
2. A fresh repository-wide import search still shows each candidate as unused.
3. Clean dependency install, typecheck, unit tests, component tests, integration
   tests, and production build pass after removal.
4. Desktop and mobile Chrome acceptance proves course navigation, authoring,
   reordering, notifications actually removed, and lesson search working.
5. The fixture ownership preflight finds no unexplained production reference.
