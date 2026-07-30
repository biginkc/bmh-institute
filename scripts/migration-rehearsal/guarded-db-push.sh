#!/usr/bin/env bash
set -euo pipefail

# The ONLY sanctioned way to run `supabase db push --include-all` against a
# linked BMH Institute project.
#
# Why a wrapper instead of a documented step:
# print-production-repair-commands.sh used to PRINT the gate and then print a
# bare `supabase db push --linked --include-all --yes`. Nothing chained them, so
# an operator -- or an automated loop pasting the block -- could run the push and
# skip the gate. That is how 2026-07-30 happened. Here the push is unreachable
# except through the gate: the gate runs first, strict mode aborts on any
# non-zero exit, and the push is the last thing this script does.
#
# CHECKED == PUSHED. Three deliberate bindings, all round-2 review findings:
#
#   Directory (P1-1). This script takes NO migrations-directory option, and
#   passes --enforce-canonical-paths, under which the gate refuses unless it is
#   reading exactly <repo>/supabase/migrations -- the same path the CLI reads.
#   Adding a directory option back here would let the gate approve directory A
#   while `supabase db push` applies directory B.
#
#   Database (P1-2). The gate and the push are both built from the SAME PG*
#   environment, and the gate parses the project ref exactly and interrogates the
#   live cluster's pg_control_system() identifier, so "checked TEST, pushed
#   PRODUCTION" cannot happen through a lookalike hostname.
#
#   History (P1-3). The gate records a digest of the history it approved, that
#   digest is re-verified immediately before the push, and the resulting history
#   is reconciled against it immediately after. The residual window between the
#   final verify and the CLI's first statement is documented in the gate header;
#   it cannot be closed from outside the Supabase CLI, and the post-push
#   reconciliation is what makes it detectable rather than silent.
#
# Usage:
#   export PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... PGSSLMODE=require
#   bash scripts/migration-rehearsal/guarded-db-push.sh --target=institute-production [--dry-run]
#
# --target must match an entry in scripts/migration-rehearsal/placeholder-baseline.json.
#
# Exit codes: 0 only if the gate passed AND the push succeeded AND the post-push
# reconciliation matched. Every other path is non-zero. (This script therefore
# has two success paths -- dry run and real push -- unlike the gate itself.)

TARGET=""
DRY_RUN="no"
GATE_TIMEOUT_MS=""

for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#--target=}" ;;
    --timeout-ms=*) GATE_TIMEOUT_MS="${arg#--timeout-ms=}" ;;
    --dry-run) DRY_RUN="yes" ;;
    *)
      echo "guarded-db-push: unrecognised argument '$arg'." >&2
      echo "Usage: guarded-db-push.sh --target=<label> [--dry-run] [--timeout-ms=N]" >&2
      echo "There is deliberately no migrations-directory option: the gate and the push must" >&2
      echo "read the same directory, so the repository path is the only one either may use." >&2
      exit 64
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "guarded-db-push: --target=<label> is required. Refusing." >&2
  exit 64
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

for var in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "guarded-db-push: $var is not set. Refusing to guess a connection." >&2
    exit 78
  fi
done

FINGERPRINT="$(mktemp -t bmh-migration-fingerprint)"
cleanup() { rm -f "$FINGERPRINT"; }
trap cleanup EXIT

GATE=(node scripts/migration-rehearsal/check-migration-safety.mjs
      --enforce-canonical-paths "--target=$TARGET")
[ -n "$GATE_TIMEOUT_MS" ] && GATE+=("--timeout-ms=$GATE_TIMEOUT_MS")

echo "guarded-db-push: running the migration safety gate before any write."
# No error suppression, no relaxing of strict mode, no backgrounding. A non-zero
# gate exit ends the script here and the push below is never reached.
"${GATE[@]}" "--emit-fingerprint=$FINGERPRINT"

if [ "$DRY_RUN" != "yes" ]; then
  echo "guarded-db-push: re-verifying history immediately before the push."
  "${GATE[@]}" "--verify-fingerprint=$FINGERPRINT"
fi

# Build the push connection from the SAME variables the gate just used.
# PGSSLMODE governs the gate's psql connection; the Supabase CLI negotiates TLS
# itself for a hosted --db-url, so the URL is left in the exact form the TEST
# workflow has been using successfully rather than gaining an unverified
# sslmode parameter.
ENCODED_PASSWORD="$(node -e 'process.stdout.write(encodeURIComponent(process.env.PGPASSWORD))')"
DB_URL="postgresql://${PGUSER}:${ENCODED_PASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "::add-mask::$ENCODED_PASSWORD"
  echo "::add-mask::$DB_URL"
fi

if [ "$DRY_RUN" = "yes" ]; then
  echo "guarded-db-push: gate passed. Running DRY RUN against target '$TARGET'."
  supabase db push --include-all --db-url "$DB_URL" --dry-run
  exit 0
fi

echo "guarded-db-push: gate passed. Pushing to target '$TARGET'."
supabase db push --include-all --db-url "$DB_URL" --yes

echo "guarded-db-push: reconciling post-push history against what the gate authorised."
"${GATE[@]}" "--verify-applied=$FINGERPRINT"
