---
phase: 02-content-safety-and-rate-limiting
plan: 2
subsystem: security
tags: [iframe, sandbox, content-blocks, embed, harden-05]

requires:
  - phase: 02-content-safety-and-rate-limiting
    provides: Plan 02-1 updateBlock block_type dispatch and text sanitizer branch
provides:
  - Embed iframe sandbox attribute
  - Embed iframe_src https-only save validation
  - Admin helper copy for trusted embed URLs
affects: [content-safety, harden-05, embed-blocks]

tech-stack:
  added: []
  patterns: [iframe-sandbox-defense, updateBlock-block-type-dispatch, RTL-rendered-attribute-regression]

key-files:
  created:
    - src/components/content-blocks.test.tsx
    - e2e-prod/embed-sandbox.spec.ts
  modified:
    - src/components/content-blocks.tsx
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx
    - playwright.prod.config.ts

key-decisions:
  - "EmbedBlock gets the locked sandbox value from 02-CONTEXT.md D-B1."
  - "Video iframes remain unchanged per 02-CONTEXT.md D-B2."
  - "Embed URL validation is scheme-only and trims valid https values on save."

patterns-established:
  - "Security-sensitive iframe attributes get RTL coverage against the rendered DOM."
  - "updateBlock dispatch extends by stored block_type so client payloads cannot choose their own validation branch."

requirements-completed: []

duration: 7min
completed: 2026-05-08
---

# Phase 02 Plan 2: Embed Iframe Sandbox Summary

**Sandboxed embed blocks with write-time https validation for iframe sources**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-08T20:21:30Z
- **Completed:** 2026-05-08T20:28:31Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Added the locked sandbox attribute to rendered embed-block iframes.
- Added `https://` validation and whitespace trimming for embed `iframe_src` saves.
- Preserved Plan 02-1 text sanitization dispatch inside `updateBlock`.
- Added admin helper copy under the iframe source field.
- Added a prod-config Playwright smoke that creates a disposable embed lesson, verifies unsafe URL rejection, verifies trimmed HTTPS persistence, verifies rendered sandbox, and cleans up.

## Task Commits

1. **Failing tests:** `a989f0d` test(phase-02): add failing embed sandbox coverage
2. **Implementation:** this commit, feat(phase-02): sandbox embed iframes

## Files Created/Modified

- `src/components/content-blocks.test.tsx` - RTL coverage for sandbox attribute, placeholder branches, and existing allow attribute.
- `src/components/content-blocks.tsx` - `EmbedBlock` iframe now renders the locked sandbox value.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` - `updateBlock` validates and trims embed `iframe_src`.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts` - Unit coverage for accepted and rejected embed URLs plus text branch preservation.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/blocks-editor.tsx` - Helper text clarifies trusted https embed URL boundary.
- `e2e-prod/embed-sandbox.spec.ts` - Browser-level write-path smoke for embed validation and rendered sandbox behavior.
- `playwright.prod.config.ts` - Loads Supabase browser credentials from `.env.local` for prod-config write-path smoke setup and allows `E2E_PROD_BASE_URL` process overrides.

## Decisions Made

- Followed D-B1 exactly: `allow-scripts allow-same-origin allow-forms allow-presentation`.
- Did not sandbox video-block iframes because D-B2 explicitly keeps them out of this phase.
- Kept validation to `https://` scheme only, matching D-B3.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The red tests failed for the expected reasons: sandbox was missing and embed URLs were written without validation.
- A first live-deployment Playwright run failed because the live deployment still served older code. A local-dev run against the prod DB passed.

## User Setup Required

Deploy the current branch before expecting the prod URL to pass `e2e-prod/embed-sandbox.spec.ts`. Before deploy, run it against local dev with:

```bash
E2E_PROD_BASE_URL=http://localhost:3100 npm run test:prod -- e2e-prod/embed-sandbox.spec.ts
```

## Next Phase Readiness

Plan 02-3 can now implement HARDEN-06 password reset rate limiting. HARDEN-05 is functionally complete across Plan 02-1 and Plan 02-2.

---
*Phase: 02-content-safety-and-rate-limiting*
*Completed: 2026-05-08*
