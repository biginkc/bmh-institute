# Migration history repair rehearsal

This harness is host-only. It does not use Docker and it does not connect to a hosted project. It creates a disposable PostgreSQL 17 cluster with `LC_ALL=C`, applies the historical migration stack through 039, rehearses the exact history repair as SQL, and writes evidence under `artifacts/` or a caller-selected output directory. It does not prove migrations 040 and later. Those forward migrations require separate canonical TEST evidence.

## Prerequisites

- PostgreSQL 17 with `pg_config`, `initdb`, `pg_ctl`, `psql`, and `pg_dump`
- Node.js
- `uv`, used with pinned `pglast==7.10` for PostgreSQL SQL and PL/pgSQL AST comparison
- The July 17 fetched migration evidence at `/private/tmp/bmh-migration-history-fetch-1784431792/supabase/migrations`, or an equivalent evidence directory passed explicitly

The ten legacy files are not byte-identical to 001 through 010. The comparison therefore reports both byte hashes and parsed AST equality. It strips parser source locations only. PL/pgSQL bodies are compared through the PL/pgSQL parser rather than as raw strings.

## Run the equivalence check only

```sh
mkdir -p /private/tmp/bmhi-migration-rehearsal
UV_CACHE_DIR=/private/tmp/bmhi-migration-rehearsal/uv-cache \
  uv run --with 'pglast==7.10' python \
  scripts/migration-rehearsal/compare-legacy-sql.py \
  --map scripts/migration-rehearsal/legacy-map.json \
  --evidence-dir /private/tmp/bmh-migration-history-fetch-1784431792/supabase/migrations \
  --repo-migrations-dir supabase/migrations \
  --output /private/tmp/bmhi-migration-rehearsal/legacy-equivalence-report.json
```

Expected result: ten AST-equivalent pairs. Byte equality may report `DIFF` because the fetched statements include harmless comment and trailing semicolon differences.

## Run the complete PostgreSQL 17 rehearsal

```sh
LC_ALL=C node scripts/migration-rehearsal/run-rehearsal.mjs \
  --evidence-dir /private/tmp/bmh-migration-history-fetch-1784431792/supabase/migrations \
  --output-dir /private/tmp/bmhi-migration-rehearsal/run-001
```

The command must finish with a JSON object whose status is `PASS`. Review these artifacts:

- `legacy-equivalence-report.json`
- `history-before-repair.txt`, exactly the production 14-version shape
- `history-after-repair.txt`, exactly 001 through 014
- `history-final.txt`, exactly 001 through 039
- `schema-app.sql`, the public, private, and migration-history schemas for the later production diff
- `schema-full.sql`, the full rehearsal cluster schema including local Supabase stubs
- `rehearsal-summary.json`

Do not use `--keep-cluster` except for local debugging. The normal run removes the disposable cluster even after failure.

## Re-fetch legacy SQL evidence if the July 17 worktree is gone

Use a disposable detached worktree at `origin/main` so fetched files cannot overwrite this branch. The remote operations below are reads. `migration fetch` writes only the returned evidence into the disposable worktree.

```sh
FETCH_DIR="$(mktemp -d /private/tmp/bmh-migration-history-fetch-XXXXXXXXXX)"
git worktree add --detach "$FETCH_DIR" 96e3ed3452e50132f89aa0c6775bdd8f5571289c
supabase migration list --linked --workdir "$FETCH_DIR"
supabase migration fetch --linked --workdir "$FETCH_DIR"
find "$FETCH_DIR/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print | sort
```

Verify the remote list still contains the ten stated legacy versions plus 011 through 014. Preserve the fetched directory unchanged as evidence. A management API alternative must use GET reads only, save each returned SQL statement under its exact remote version and name, and record the response hashes. Do not run `db push`, `migration repair`, or SQL against production during evidence collection.

## Print the real production command sequence

This script only prints commands. It does not run them.

```sh
bash scripts/migration-rehearsal/print-production-repair-commands.sh
```

Run the printed commands only after the equivalence report and full rehearsal pass. The history repair updates only `supabase_migrations.schema_migrations`. It does not apply or revert schema SQL. The printed order intentionally marks 001 through 010 applied first, removes the ten legacy rows second, then requires `migration list` and a dry run before the actual push. The printed sequence contains no bare `supabase db push --include-all`; the only push line is `guarded-db-push.sh`.

## Mandatory safety gate before any `--include-all` push against a linked project

`check-migration-safety.mjs` is a preflight gate, added after the 2026-07-30 production
incident where an automated reconciliation loop re-applied an old, already-superseded
migration (`20260728091000_hugo_access_provisioner.sql`) directly to production because it
had no row in `supabase_migrations.schema_migrations`. `--include-all` re-applies anything
missing from history, in filename order, with no notion that a later migration already
touched the same objects. That re-apply reverted 6 hardened Hugo lifecycle functions and
locked out a real user for hours.

### Always push through the wrapper

```sh
export PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... PGSSLMODE=require
export GUARDED_PUSH_EXPECTED_GIT_SHA="$(git rev-parse HEAD)"
bash scripts/migration-rehearsal/guarded-db-push.sh --target=institute-production --dry-run
bash scripts/migration-rehearsal/guarded-db-push.sh --target=institute-production
```

`guarded-db-push.sh` runs the gate and then the push, under `set -euo pipefail`, from one
connection definition. A non-zero gate exit ends the script and the push is never reached.
Do not run `supabase db push --include-all` directly against a linked project — a gate that
merely sits next to the dangerous command in a runbook is a suggestion, not a gate, and that
is precisely how the incident happened. CI (`.github/workflows/db-migrate-test.yml`) pushes
through the same wrapper for the same reason.

The wrapper takes **no path, baseline or test-mode option**. The gate enforces the canonical
repository paths by default, so it is provably reading the same `supabase/migrations` the CLI
reads. The wrapper also:

- holds a session-scoped PostgreSQL **advisory lock** across gate, verify, push and
  reconcile, confirmed by backend pid in `pg_locks` and released by an `EXIT` trap, so two
  sanctioned runs cannot interleave;
- fingerprints the **bytes** of every migration file plus the remote history, re-verifies both
  immediately before the push, and reconciles again immediately after;
- **always reconciles, including after a failed push**, because a push can apply part of the
  set and then fail — that partial state is reported specifically (`E31`).

The gate can also be run on its own for inspection:

```sh
node scripts/migration-rehearsal/check-migration-safety.mjs --target=institute-production
```

### What it refuses on

Everything indeterminate fails closed. The script header carries the complete exit-path
enumeration (`E00`–`E23`); each refusal prints its code. In summary it refuses when:

- the database is unreachable, credentials are missing or wrong, the query errors, the
  connection times out, or `supabase_migrations.schema_migrations` is absent or empty;
- the migrations directory is missing, is not a directory, or contains **zero** `.sql`
  files (an empty or mistyped path used to print `OK`);
- a version string is malformed, over 14 digits, duplicated after normalisation, or ordered
  ambiguously relative to the string order `supabase db push` will actually use;
- `schema_migrations` contains a placeholder row (`statements IS NULL`) that is **not** in
  the acknowledged baseline for `--target`;
- any locally pending migration is **older** than the newest version already recorded in
  history — the exact out-of-order re-apply shape that caused the incident.

Version identity is normalised, so remote `1` and local `001_x.sql` are recognised as the
same migration. Legacy short-numeric versions and 14-digit timestamps are treated as two
ordered namespaces (all legacy sorts before all timestamps), not one number line.

### The placeholder baseline

`supabase migration repair` creates rows with `statements IS NULL`. They assert a version is
applied without recording what was applied, so history stops being proof of what is live.
Refusing on *any* such row self-deadlocks: the production repair sequence creates them, and
Institute production already carries 8 (Sandra carries 36 of 127).

`placeholder-baseline.json` records, per target, the placeholder **versions** a human has
already reconciled against the live schema. A placeholder in that list is accepted; one that
is not stops the push. Adding a version is a reviewed commit, never a runtime flag, so an
automated loop cannot acknowledge the very row that should have stopped it. When the gate
refuses with `E21` it prints the exact paste-ready array.

The baseline is read out of **git's object store at HEAD**, never from the working tree
(`git show HEAD:<path>`). An untracked, merely staged, symlinked, or hardlinked file at that
path cannot substitute for the reviewed blob, and there is no validate-then-open window to
race. An uncommitted edit therefore has no effect — committing it is the acknowledgement.
Sandra's guard uses the identical mechanism; keep the two converged.

Each baseline entry also pins identity: `project_ref` (matched **exactly** against
`postgres.<ref>` in PGUSER or `db.<ref>.supabase.co` in PGHOST — never as a substring),
`database` (compared to PGDATABASE *and* to the live `current_database()`), and
`db_system_identifier` (the cluster's `pg_control_system()` value).

Every key must be present **and non-null**. A `null` identity field does *not* disable the
check — it fails the run closed (`E06`). An earlier revision shipped a `local-rehearsal`
target with all three nulls, which combined with "null means skip" was a committed bypass:
`guarded-db-push.sh --target=local-rehearsal` would have run against production with identity
verification off. Unbound targets now exist only under the gate's `--test-mode`, which the
wrapper has no option to pass. Do not reintroduce either half.

`db_system_identifier` identifies a cluster *lineage*, not a project: a physical restore or a
byte-level clone preserves it, and a logical branch of the same project gets a new one. It is
a fail-closed operational signal — it reliably catches "you are pointed at a different
database than this target was reviewed against" — not complete identity proof. It is one of
three independent bindings, alongside the exact ref parse and `current_database()`.

### Proving the gate still works

```sh
npm run test:migration-gate:postgres
```

Spins one disposable local PostgreSQL cluster (`LC_ALL=C` plus a short socket path, to avoid
the "postmaster became multithreaded" startup flake) and runs the real gate and the real
wrapper. The harness reports its exact scenario count and fails unless every scenario
passes. It never touches a hosted project.

Coverage includes: the pass case, the 2026-07-30 incident replay, empty and missing
migrations directories, `001`/`1` and `0001`/`001` formatting collisions, mixed
legacy/timestamp schemes, acknowledged versus new placeholder rows, unreachable and silent
databases, every malformed-input path, untracked/symlinked/outside-the-repo/working-tree-edited
baselines, a hung `git`, substring-lookalike hostnames and usernames, a mismatched cluster
identifier, symlinked and non-canonical migrations directories, path overrides and unbound
identity refused without `--test-mode`, a migration's SQL body swapped after approval,
history changing between gate and push, partial application, and post-push reconciliation.

The end-to-end block runs `guarded-db-push.sh` for real in a scratch repo with a **fully
pinned** identity (a `postgres.<ref>` superuser role is created in the cluster so the exact
ref parse succeeds) and a stub `supabase` on PATH. It proves the push reads the same
directory the gate approved, that the advisory lock is held while the push runs, that a
second wrapper refuses rather than racing a held lock, that a partially-applied failing push
still reconciles and reports `E31`, that bytes rewritten during the push are caught, and that
an unbound-identity target cannot be reached through the wrapper at all.

It also prints measured numbers rather than asserting them — the verify-to-first-statement
window, the hung-`git` refusal time, and how long a blocked wrapper waits.

## Run migrations 039 through 045 integration coverage against BMH Institute test

The integration file is not a local-only test. It creates and removes test users and course-import rows. It also opens direct PostgreSQL sessions for contention coverage. The authorized target is only `bmh-institute-test`, project ref `jvaabkchkihkjllehmft`.

Populate `.env.test.local` without printing values:

```text
TEST_SUPABASE_URL=https://jvaabkchkihkjllehmft.supabase.co
TEST_SUPABASE_ANON_KEY=<test anon key>
TEST_SUPABASE_SERVICE_ROLE_KEY=<test service role key>
TEST_SUPABASE_DB_URL=<canonical test pooler URL>
```

Read existing values through the BMH Secrets 1Password service account only. Do not use a desktop or browser approval flow and do not paste secret values into logs. Build `TEST_SUPABASE_DB_URL` in the shell with the percent-encoded test database password. Confirm the URL, database username suffix, and pooler host match the test project exactly.

The Vitest config requires and forwards all four values before it discovers any
test. It validates the exact TEST HTTP URL and TEST pooler URL. It also checks
that both API keys have the required role and are accepted by the canonical
TEST project. A missing or mismatched value fails the run instead of skipping
the hosted coverage.

First make the test project schema current. Test-project writes are authorized
for this work order. Read the database password without printing it or placing
it in shell history. Replace the field reference with the existing BMH Secrets
field path, not a literal secret:

```sh
export OP_SERVICE_ACCOUNT_TOKEN="$(security find-generic-password -w -s OP_SERVICE_ACCOUNT_TOKEN)"
BMHI_TEST_DB_PASSWORD="$(op read 'op://BMH Secrets/Supabase - BMH Institute Test DB Password/password')"
export BMHI_TEST_DB_PASSWORD
TEST_SUPABASE_DB_URL="$(node -e 'const p=encodeURIComponent(process.env.BMHI_TEST_DB_PASSWORD); process.stdout.write(`postgresql://postgres.jvaabkchkihkjllehmft:${p}@aws-1-us-west-1.pooler.supabase.com:5432/postgres`)')"
export TEST_SUPABASE_DB_URL
unset BMHI_TEST_DB_PASSWORD
node -e 'const u=new URL(process.env.TEST_SUPABASE_DB_URL); const ok=u.protocol==="postgresql:"&&u.username==="postgres.jvaabkchkihkjllehmft"&&u.password&&u.hostname==="aws-1-us-west-1.pooler.supabase.com"&&u.port==="5432"&&u.pathname==="/postgres"&&!u.search&&!u.hash; if(!ok) process.exit(1)'
supabase db push --db-url "$TEST_SUPABASE_DB_URL" --include-all --dry-run
supabase db push --db-url "$TEST_SUPABASE_DB_URL" --include-all --yes
npm run test:integration -- src/lib/security/import-release-control.integration.test.ts
```

The Vitest command must execute the file rather than report it skipped. A passing run includes destructive cleanup of only the unique test records it creates. If the first push dry run does not list only expected pending test migrations, stop and reconcile the test history before writing.
