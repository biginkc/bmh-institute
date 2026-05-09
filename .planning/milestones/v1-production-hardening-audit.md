# Milestone Audit: v1 Production Hardening

Date: 2026-05-08
Status: pass with tracked deferral

## Scope

This audit covers the v1 Production Hardening milestone in `ROADMAP.md`.

The milestone goal was to close security and data-integrity gaps before the BMH team scales usage. It explicitly excluded new user-facing features.

## Verdict

The milestone is complete enough to close.

All planned phases are complete:

- Phase 1: Auth and Access Hardening
- Phase 01.1: Testing Coverage Parity
- Phase 2: Content Safety and Rate Limiting
- Phase 2.5: Sandra Design System Stitch Pass
- Phase 3: Data Integrity
- Phase 4: Type Safety and Test Coverage

The only open requirement is `TEST-03`, which is deliberately deferred to GitHub issue #2 because durable write-path Playwright coverage needs a non-prod Supabase target and stable email capture.

## Requirement Coverage

| Area | Requirements | Result |
|------|--------------|--------|
| Security hardening | `HARDEN-01` through `HARDEN-06` | Complete |
| Data integrity | `INTEG-01` through `INTEG-04` | Complete |
| Type safety | `TYPE-01` | Complete |
| Test coverage | `TEST-01`, `TEST-02` | Complete |
| Durable Playwright write paths | `TEST-03` | Deferred to issue #2 |
| Testing parity | `TPAR-01` through `TPAR-05` | Complete |

There are no unmapped v1 requirements in `REQUIREMENTS.md`.

## Verification Evidence

Phase evidence reviewed:

- `01-VERIFICATION.md`: admin route guards, expired invites, user deletion, answer option isolation.
- `02-VERIFICATION.md`: HTML sanitization, sandboxed embeds, auth rate limits, deploy proof, browser smoke.
- `03-VERIFICATION.md`: role-group rollback, module reorder safety, certificate counter concurrency, assignment file path validation.
- `04-*-SUMMARY.md`: Supabase generated types, unit coverage, certificate trigger integration, write-path deferral.

The latest project state records:

- 6 of 6 phases complete.
- 18 of 18 plans complete.
- Phase 4 complete with `TEST-03` deferred to issue #2.

## Tracked Deferrals

| Item | Where Tracked | Reason |
|------|---------------|--------|
| Durable Playwright write-path coverage | GitHub issue #2 | Needs non-prod Supabase, migrated storage buckets, stable seed setup, and email capture |
| Role-play embed | v2 requirements `EMBD-01` through `EMBD-05` | Future BMH Institute embed surface for Sandra Practice or Closer Lab role-play runtime |
| Performance work | v2 requirements `PERF-01` through `PERF-03` | Not part of v1 hardening |

## Risks Left Open

- `TEST-03` is not automated yet. Manual Playwright production verification covered the major write paths, but CI-safe durable coverage still depends on a non-prod Supabase environment.
- Invite acceptance was not fully verified because production Supabase email limits were hit. This belongs with issue #2 once email capture is available.
- Phase 2.5 produced Stitch artifacts and design direction. It did not fully implement the shared BMH ecosystem navigation in production UI.

## Next Recommended Milestone

Start a focused UI implementation milestone for BMH ecosystem navigation alignment.

Recommended first phase:

Shared top nav and left nav implementation for BMH Institute, using Sandra, Closer Lab, Jitter, and the existing BMH Institute Stitch pass as references.

Acceptance direction:

- BMH Institute uses the same top nav and left nav structure as the BMH ecosystem apps.
- The production app follows the Phase 2.5 design contract instead of only preserving mockups.
- Admin and learner routes keep their existing permissions and data behavior.
- Browser verification covers desktop and responsive navigation states.
- Durable tests are added only where the behavior should remain stable.

## Closure Decision

Close v1 Production Hardening as complete with tracked deferral.

Do not keep stale prototype PRs open for v2 scope. PR #1 was closed because it overlapped future `EMBD-01` through `EMBD-05` work and had become stale against current `main`.
