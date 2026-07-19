# BMHI-EXEC-03 convergence ledger

- Goal: adversarial merge-gate review of PR #98 at `e597928` plus a migration-history repair rehearsal harness.
- Plan source: Jarrad's BMHI-EXEC-03 work order and PR #98.
- Baseline: `origin/main` at `96e3ed3`; head `e597928`; 294 commits and 1,088 changed files.
- Authority: local read and uncommitted harness writes only. No hosted writes, production access, merge, deploy, or commit.
- Claude transport: this explicit Claude-orchestrated EXECUTE block. CLI fallback is installed and authenticated but was not used because this report is the requested return transport.

## Acceptance gates

- Complete branch diff reviewed: changes required. Three independent review lanes plus root review covered schema/private access, importer/rollback, CI/config/tests/secrets, banked commits, and local verification.
- Old production schema compatibility: failed. New runtime calls schema and RPCs introduced in 015 through 039, while no CI or deploy gate forces production migrations first.
- Private review boundary: failed. Multiple non-reviewer admin and activity-state bypasses found.
- Production importer flag gate: passed. No importer CLI path was found that mutates production without `--execute` and `--allow-production`.
- Phase-3 rollback safety: failed. Normal reviewer learner activity blocks exact rollback and may enqueue Sandra delivery.
- Banked commits: `f0a0da3` behavior reviewed clean; `e597928` adds useful coverage but introduces a lint error and retains dangerous hosted-test gaps.
- Local verification: unit, RTL, typecheck, build, course content, artwork, and harness contract tests pass. Lint fails with one error. Exact-head GitHub Seeded Playwright E2E fails.
- Hosted 039 integration: not run under this sandbox. It is unsafe until its DB URL is explicitly bound to the canonical test project.
- PG17 rehearsal: authored but not executed under this sandbox. Claude must run it on the host with `LC_ALL=C`.

## Findings summary

- P1: private reviewers create progress and completion evidence that makes rollback impossible and may emit unreleased Sandra completion.
- P1: non-reviewer admins can change private imported answer options through a service-role server action.
- P1: private reviewer assignment submissions and files remain visible and mutable to every admin.
- P1: direct 039 integration execution can connect to and lock production because the DB URL is not canonical-test validated.
- P1: the 039 integration file can skip green when its DB URL is absent.
- P1: new app and old production schema are incompatible without DB-first sequencing.
- P1: exact-head Seeded Playwright E2E is red on `/admin/reports`.
- P2: banked `e597928` fails lint because it assigns to `module`.
- P2: Phase-3 private reviewer operations are absent from the import and release-control runbooks.
- P2: fetched production evidence for numbered 014 is not SQL-AST equivalent to the repository file and needs explicit schema/grant reconciliation.

## Harness evidence

- Ten legacy files are byte-different but SQL-AST and PL/pgSQL-AST equivalent to 001 through 010.
- No-database harness contract tests: 4 passed.
- Python syntax, Node syntax, shell syntax, ESLint on new JavaScript, PostgreSQL parsing of repair SQL, and diff whitespace checks pass.
- Full host execution and resulting schema dump remain required.

## Outcome

Changes required. No merge, deploy, production access, hosted write, commit, or push performed.
