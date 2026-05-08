---
phase: 02-content-safety-and-rate-limiting
plan: 1
subsystem: security
tags: [sanitize-html, xss, content-blocks, certificates, supabase]

requires:
  - phase: 01.1-testing-coverage-parity
    provides: Vitest and RTL suites included in npm run verify
provides:
  - Text block HTML sanitizer with strict prose allowlist
  - Certificate body sanitizer preserving seeded inline styles
  - updateBlock write-time sanitization for text blocks
  - Idempotent sanitize-html backfill script
affects: [content-safety, harden-05, embed-sandbox, certificates]

tech-stack:
  added: [sanitize-html, @types/sanitize-html, tsx]
  patterns: [sanitize-on-write, idempotent backfill script, TDD red-green commits]

key-files:
  created:
    - src/lib/sanitize/text-block.ts
    - src/lib/sanitize/text-block.test.ts
    - src/lib/sanitize/certificate.ts
    - src/lib/sanitize/certificate.test.ts
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts
    - scripts/backfill-sanitize-html.ts
  modified:
    - src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Sanitization runs on write for text blocks, not on render."
  - "Certificate template sanitization ships as a library plus one-shot backfill because no admin template editor exists yet."
  - "Backfill uses the service-role admin client and skips no-op rows so it is safe to re-run."

patterns-established:
  - "HTML entered by admins is normalized before storage."
  - "Sanitizer options live in small src/lib/sanitize modules with direct unit tests."
  - "One-shot data repair scripts live under scripts/ and run through npm scripts."

requirements-completed: []

duration: 12min
completed: 2026-05-08
---

# Phase 02 Plan 1: Sanitize HTML Policy Summary

**Write-time sanitize-html coverage for text blocks and certificate templates with a reusable backfill path**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-08T20:09:00Z
- **Completed:** 2026-05-08T20:21:09Z
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments

- Added strict text block HTML sanitization that strips scripts, unsafe links, and inline styles.
- Added certificate body sanitization that preserves the seeded template styles while stripping scripts and non-HTTPS image sources.
- Updated `updateBlock` to read the stored block type and sanitize text HTML before writing to Supabase.
- Added an idempotent `npm run backfill:sanitize-html` script for existing rows.

## Task Commits

1. **Planning repair:** `086f018` docs(planning): repair phase 2 plan state
2. **Failing tests:** `b01f8ac` test(phase-02): add failing sanitize html coverage
3. **Implementation:** this commit, feat(phase-02): sanitize admin html on write

## Files Created/Modified

- `src/lib/sanitize/text-block.ts` - Strict prose sanitizer for text content blocks.
- `src/lib/sanitize/text-block.test.ts` - Unit coverage for script stripping, href schemes, anchor rel, style stripping, and idempotency.
- `src/lib/sanitize/certificate.ts` - Certificate HTML sanitizer with approved inline style properties.
- `src/lib/sanitize/certificate.test.ts` - Unit coverage for seeded template preservation, style filtering, image schemes, script stripping, and idempotency.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.ts` - Text block writes now sanitize `content.html`.
- `src/app/(dashboard)/admin/lessons/[lessonId]/edit/actions.test.ts` - Unit coverage for text block dispatch, missing block handling, and non-text passthrough.
- `scripts/backfill-sanitize-html.ts` - One-shot service-role backfill for text content blocks and certificate templates.
- `package.json` and `package-lock.json` - Added sanitizer dependencies and `backfill:sanitize-html`.

## Decisions Made

- Followed CONTEXT.md D-A2: sanitize on write and keep render paths unchanged.
- Did not add a certificate admin action because the codebase has no certificate template editor today.
- Kept backfill as a manual script rather than a migration so sanitizer behavior stays in TypeScript.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The red test commit failed for the expected reasons: missing sanitizer modules, unsanitized text block writes, and no missing-block guard.
- `npm install` reported existing audit findings: 5 moderate and 1 high vulnerability. No audit fix was run because that is outside this phase.

## User Setup Required

Run the backfill manually after deploying the sanitizer code:

```bash
npm run backfill:sanitize-html
```

The script requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Next Phase Readiness

Plan 02-2 can now add the embed iframe sandbox and `https://` validation. It shares `updateBlock`, so it should preserve the text sanitizer branch added here and extend dispatch for `block_type === "embed"`.

---
*Phase: 02-content-safety-and-rate-limiting*
*Completed: 2026-05-08*
