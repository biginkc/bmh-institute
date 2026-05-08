---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Phase 2 plan 02-1 complete; ready for 02-2 embed iframe sandbox
last_updated: "2026-05-08T20:21:09.000Z"
last_activity: 2026-05-08 -- completed 02-1 sanitize-html policy with tests, write-time sanitization, and backfill script
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 10
  completed_plans: 8
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-30)

**Core value:** A VA can sign in via an admin invite, work through assigned programs and courses on their own time, take quizzes and submit assignments without supervision, and receive a certificate when they finish. Admins can author content, manage learners, review submissions, and see who is making progress without leaving the platform.
**Current focus:** Phase 2 - content-safety-and-rate-limiting

## Current Position

Phase: 02 (content-safety-and-rate-limiting) - PLANNED
Plan: 2 of 3 next (02-2-embed-iframe-sandbox)
Status: Plan 02-1 complete; HARDEN-05 sanitization half shipped, iframe sandbox half remains
Last activity: 2026-05-08 -- Plan 02-1 sanitize-html policy complete

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**

- Total plans completed: 1 (in Phase 01.1)
- Average duration: ~5 min
- Total execution time: ~5 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01.1 | 1 | ~5 min | ~5 min |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01.1 P1 | ~5m | 3 tasks | 5 files |
| Phase 01.1 P2 | ~12m | 3 tasks | 4 files |
| Phase 01.1 P3 | ~9m | 3 tasks | 7 files |

## Accumulated Context

### Roadmap Evolution

- Phase 01.1 inserted after Phase 1: Testing Coverage Parity: bring repo to Sandra CRM testing standard (RTL config, Playwright e2e dir, deps, scripts) and replace phase 1 HUMAN-UAT items with automated specs (URGENT)
- Phase 2 planned as three file-disjoint hardening plans: 02-1 sanitize HTML, 02-2 sandbox embed iframes, 02-3 password reset rate limits

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Milestone init: First GSD-managed milestone is a hardening pass, not features. Coarse granularity, parallel execution, YOLO mode.
- TDD rule: Test inventory must be enumerated and approved before any tests or code are written.
- 2026-05-01 (Plan 01.1-1): RTL config and setup mirror Sandra CRM verbatim including the localStorage shim. Vitest 4 transforms TSX natively so no @vitejs/plugin-react. Failing-tests commit lands with HUSKY=0 because the harness has not been installed yet; the harness commit runs the full hook end-to-end.
- 2026-05-01 (Plan 01.1-2): e2e fixtures expose adminClient + ensureTestUser + prod-ref guard only; write-path helpers deferred until Path B/C lock
- 2026-05-01 (Plan 01.1-2): BMH e2e fixtures use untyped SupabaseClient (src/lib/supabase/types.ts does not exist; TYPE-01 territory in Phase 4)
- 2026-05-01 (Plan 01.1-3): storage-state strategy locked as in-spec opt-out via test.use storageState empty — Option 1, smallest delta, no learner-only account on prod
- 2026-05-01 (Plan 01.1-3): Path A locked — destructive HARDEN-02 and HARDEN-03 UI variant remain manual until a write-capable test environment exists
- 2026-05-01 (Plan 01.1-3): 01-HUMAN-UAT.md status changed to closed-with-deferrals; file is a closed historical record
- 2026-05-08 (Phase 2 repair): Phase 2 has three plans per 02-CONTEXT.md D-E1. The missing 02-3 password-reset-rate-limit plan was regenerated from 02-CONTEXT.md, 02-RESEARCH.md, and 02-PATTERNS.md. ROADMAP and REQUIREMENTS now mark HARDEN-05/HARDEN-06 as planned, not executed.
- 2026-05-08 (Plan 02-1): Text block and certificate HTML sanitizers use sanitize-html on write. Existing render paths stay unchanged. Certificate template writes have no admin UI today, so the shipped enforcement is sanitizer library plus manual backfill script.

### Pending Todos

None yet.

### Blockers/Concerns

- TYPE-01 (Supabase type generation) is a prerequisite for tight test fixtures in TEST-01..03. Phase 4 depends on Phase 3 completing first to stabilize the migration surface before generating types.
- Integration tests (TEST-02) run against the production Supabase project. No writes in integration tests without explicit confirmation of safe harness setup.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Role-play embed | EMBD-01..05 | v2 | Milestone init |
| Performance | PERF-01..03 | v2 | Milestone init |

## Session Continuity

Last session: 2026-05-08T20:21:09.000Z
Stopped at: Phase 2 plan 02-1 complete; execute 02-2 next.
Resume file: .planning/phases/02-content-safety-and-rate-limiting/02-2-embed-iframe-sandbox-PLAN.md
Session handoff: docs/handoff/2026-05-04-bmh-institute-rename.md (paste-ready next-tab prompt + verification block)

### 2026-05-08 - Phase 2 plan 02-1 complete

- Added `sanitize-html`, `@types/sanitize-html`, and `tsx`.
- Added text block sanitizer and certificate sanitizer under `src/lib/sanitize/`.
- `updateBlock` now reads the stored `block_type` and sanitizes `content.html` for text blocks before the update.
- Added `scripts/backfill-sanitize-html.ts` and `npm run backfill:sanitize-html` for existing rows.
- TDD commits:
  - `b01f8ac` failing tests
  - implementation commit, feat(phase-02): sanitize admin html on write
- Verification passed: `npm run verify`.

### 2026-05-08 - Phase 2 planning state repair

- GSD health check reported degraded with no auto-repairable issues.
- Existing untracked Phase 2 plans preserved:
  - `.planning/phases/02-content-safety-and-rate-limiting/02-1-sanitize-html-policy-PLAN.md`
  - `.planning/phases/02-content-safety-and-rate-limiting/02-2-embed-iframe-sandbox-PLAN.md`
- Missing plan added:
  - `.planning/phases/02-content-safety-and-rate-limiting/02-3-password-reset-rate-limit-PLAN.md`
- `ROADMAP.md` now lists all three Phase 2 plans and progress as 0/3 Planned.
- `REQUIREMENTS.md` traceability now marks HARDEN-01..04 Complete and HARDEN-05/HARDEN-06 Planned.
- Next step: execute 02-1 with TDD inventory approval before writing tests or production code.

### 2026-05-08 — backlog Phase 999.1 complete

- Repo folder moved from `/Users/jarradhenry/Sites/Sandra University` to `/Users/jarradhenry/Sites/BMH Institute`.
- Claude memory directory moved from `~/.claude/projects/-Users-jarradhenry-Sites-Sandra-University` to `~/.claude/projects/-Users-jarradhenry-Sites-BMH-Institute`.
- `.env.local` old rename strings cleared without printing secrets.
- `.vercel/project.json` confirmed with `projectName: "bmh-institute"`.
- `npm run verify` passed from the new path: typecheck, 117 unit tests, 1 RTL test.

### 2026-05-04 — backlog Phase 999.1 (in-repo step)

- Commit `04deb69`: 9 files updated to swap Sandra University → BMH Institute (env example, e2e-prod assertion, planning codebase docs, AGENTS.md caveat). `npm run verify` green via husky.
- `.vercel/project.json` updated locally to `projectName: "bmh-institute"` (gitignored — local realignment with already-renamed Vercel upstream).
- Telegram channel: not yet configured. User to message @BotFather and run `/telegram:configure <token>` after reopening in the new path.
