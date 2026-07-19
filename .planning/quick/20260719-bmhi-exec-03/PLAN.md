---
status: in-progress
created: 2026-07-19
task: BMHI-EXEC-03
---

# BMHI-EXEC-03 adversarial review and migration rehearsal

Review PR #98 at `e597928` against `origin/main` at `96e3ed3` as a merge gate. Stress test old-schema compatibility, the private-review boundary, importer production gates, banked commits, and rollback safety. Run the fresh local verification suite. Author a host-executable PostgreSQL 17 migration-history repair rehearsal under `scripts/migration-rehearsal/` without executing hosted writes or committing changes.

## Acceptance

- Every changed file is covered by a local or independent review lane.
- Findings are evidence-backed and ranked by severity.
- Unit, locally runnable integration, build, lint, and TypeScript results are captured verbatim.
- The rehearsal verifies legacy SQL equivalence, rehearses exact production history repair, applies 015 through 039, dumps schema, and emits the production repair command sequence with a linked dry run.
- The hosted 039 integration test has exact TEST-project run instructions or an explicit blocker.
- All authored files remain uncommitted.
