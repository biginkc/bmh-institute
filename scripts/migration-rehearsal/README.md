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

Run the printed commands only after the equivalence report and full rehearsal pass. The history repair updates only `supabase_migrations.schema_migrations`. It does not apply or revert schema SQL. The printed order intentionally marks 001 through 010 applied first, removes the ten legacy rows second, then requires `migration list` and `db push --dry-run` proof before the actual push.

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
