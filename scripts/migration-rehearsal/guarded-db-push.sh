#!/usr/bin/env bash
set -euo pipefail

# The ONLY sanctioned way to run `supabase db push --include-all` against a
# linked BMH Institute project.
#
# Why a wrapper instead of a documented step:
# print-production-repair-commands.sh used to PRINT the gate and then print a
# bare `supabase db push --linked --include-all --yes`. Nothing chained them, so
# an operator -- or an automated loop pasting the block -- could run the push and
# skip the gate. That is how 2026-07-30 happened.
#
# CHECKED == PUSHED. Four bindings, each an adversarial-review finding:
#
#   Directory. This script takes NO migrations-directory option and passes NO
#   path overrides. The gate enforces the canonical repository path by DEFAULT
#   and refuses any override unless --test-mode is given, which this script has
#   no way to pass.
#
#   Identity. The gate and the push are both built from the SAME PG*
#   environment. The gate parses the project ref exactly, checks PGDATABASE, and
#   interrogates the live cluster. A baseline target with any unbound identity
#   field fails closed, so there is no "unbound target" to select.
#
#   Content. The gate fingerprints the BYTES of every migration file, not just
#   version numbers, and re-checks them before the push and again afterwards.
#
#   History + concurrency. A session-scoped PostgreSQL advisory lock is held
#   across gate, verify, push and reconcile, so two sanctioned wrappers cannot
#   interleave. A history digest is verified immediately before the push and
#   reconciled immediately after.
#
# WHAT THE LOCK DOES AND DOES NOT DO. It serialises sanctioned wrappers against
# each other -- that is real, and it is why it exists. It does NOT bind anything
# that does not take it: a raw `supabase db push`, a `supabase migration repair`,
# a psql session, or the 2026-07-30 style ungated loop will all proceed straight
# through a held lock. Against those, the protection is the pre-push verify (a
# narrow window) plus the post-push reconciliation (detection, not prevention).
# Truly closing that window needs an upstream "apply only if history is still X"
# option in the Supabase CLI. The harness MEASURES the window and prints it
# rather than anyone asserting it is small.
#
# PARTIAL PUSHES. `supabase db push` can apply some migrations and then fail.
# Under a naive `set -e` this script would abort before reconciling and leave the
# database altered with nobody looking. The push status is captured, the
# reconciliation ALWAYS runs, and the worse of the two statuses is propagated.
#
# Usage:
#   export PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... PGSSLMODE=require
#   bash scripts/migration-rehearsal/guarded-db-push.sh --target=institute-production [--dry-run]
#
# --target must match an entry in scripts/migration-rehearsal/placeholder-baseline.json.
#
# Exit codes: 0 only if the gate passed AND the push succeeded AND the post-push
# reconciliation matched. Every other path is non-zero. (This script has two
# success paths -- dry run and real push -- unlike the gate itself.)

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
      echo "There is deliberately no migrations-directory, baseline, repo-root or test-mode" >&2
      echo "option: the gate and the push must read the same directory, the same bytes and" >&2
      echo "the same fully-identified database." >&2
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

# ---------------------------------------------------------------------------
# Advisory lock, held for the whole run.
# ---------------------------------------------------------------------------
# Two-int form so pg_locks can be queried directly (objsubid = 2). The key is
# arbitrary but fixed; every sanctioned wrapper uses it.
LOCK_CLASS=778533
LOCK_OBJ=20260730
LOCK_WAIT_SECONDS="${GUARDED_PUSH_LOCK_WAIT_SECONDS:-120}"

WORKDIR="$(mktemp -d -t bmh-guarded-push)"
FINGERPRINT="$WORKDIR/fingerprint.json"
LOCK_FIFO="$WORKDIR/lock.fifo"
LOCK_OUT="$WORKDIR/lock.out"
LOCK_PID=""
LOCK_BACKEND_PID=""

cleanup() {
  # Closing the write end EOFs the holder's stdin, which ends its session and
  # releases the lock. The kill is a backstop for a wedged client.
  exec 9>&- 2>/dev/null || true
  if [ -n "$LOCK_PID" ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$LOCK_PID" 2>/dev/null || break
      sleep 0.2
    done
    kill -9 "$LOCK_PID" 2>/dev/null || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkfifo "$LOCK_FIFO"
# The holder reads the FIFO read-only, so closing the parent's write end below
# genuinely EOFs it. `-o` captures the backend pid we then confirm in pg_locks:
# counting granted locks alone would also count a lock held by someone else.
psql --no-psqlrc -X -q -t -A -v ON_ERROR_STOP=1 -o "$LOCK_OUT" \
  -c "select pg_backend_pid()" \
  -c "set lock_timeout = '${LOCK_WAIT_SECONDS}s'" \
  -c "select pg_advisory_lock(${LOCK_CLASS}, ${LOCK_OBJ})" \
  -f - < "$LOCK_FIFO" >/dev/null 2>"$WORKDIR/lock.err" &
LOCK_PID=$!
exec 9>"$LOCK_FIFO"

echo "guarded-db-push: acquiring the migration advisory lock (up to ${LOCK_WAIT_SECONDS}s)."
LOCK_HELD="no"
DEADLINE=$(( $(date +%s) + LOCK_WAIT_SECONDS ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if ! kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "guarded-db-push: the lock holder exited before the lock was confirmed. Refusing." >&2
    cat "$WORKDIR/lock.err" >&2 || true
    exit 75
  fi
  LOCK_BACKEND_PID="$(head -n 1 "$LOCK_OUT" 2>/dev/null || true)"
  if [ -n "$LOCK_BACKEND_PID" ]; then
    HELD="$(psql --no-psqlrc -X -q -t -A -v ON_ERROR_STOP=1 -c \
      "select count(*) from pg_locks where locktype='advisory' and classid=${LOCK_CLASS} \
       and objid=${LOCK_OBJ} and objsubid=2 and granted and pid=${LOCK_BACKEND_PID}" 2>/dev/null || echo 0)"
    if [ "$HELD" = "1" ]; then
      LOCK_HELD="yes"
      break
    fi
  fi
  sleep 0.5
done

if [ "$LOCK_HELD" != "yes" ]; then
  echo "guarded-db-push: could not confirm the advisory lock within ${LOCK_WAIT_SECONDS}s." >&2
  echo "Another sanctioned migration run is probably in progress. Refusing rather than" >&2
  echo "racing it." >&2
  exit 75
fi
echo "guarded-db-push: advisory lock held by backend pid ${LOCK_BACKEND_PID}."

GATE=(node scripts/migration-rehearsal/check-migration-safety.mjs "--target=$TARGET")
[ -n "$GATE_TIMEOUT_MS" ] && GATE+=("--timeout-ms=$GATE_TIMEOUT_MS")

echo "guarded-db-push: running the migration safety gate before any write."
# No error suppression, no relaxing of strict mode, no backgrounding. A non-zero
# gate exit ends the script here and the push below is never reached.
"${GATE[@]}" "--emit-fingerprint=$FINGERPRINT"

if [ "$DRY_RUN" != "yes" ]; then
  echo "guarded-db-push: re-verifying history and migration bytes immediately before the push."
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
# Timestamp emitted so the harness can MEASURE the verify-to-first-statement
# window rather than anyone asserting it is small.
echo "guarded-db-push: verify complete at $(node -e 'process.stdout.write(String(Date.now()))') ms."

PUSH_STATUS=0
supabase db push --include-all --db-url "$DB_URL" --yes || PUSH_STATUS=$?
if [ "$PUSH_STATUS" -ne 0 ]; then
  echo "guarded-db-push: the push FAILED with status $PUSH_STATUS." >&2
  echo "Reconciling anyway -- a failed push can still have applied part of the set." >&2
fi

# Always reconcile, including after a failed push. A partial application is
# exactly the silent-damage case this whole design exists to catch.
echo "guarded-db-push: reconciling post-push history against what the gate authorised."
RECONCILE_STATUS=0
"${GATE[@]}" "--verify-applied=$FINGERPRINT" || RECONCILE_STATUS=$?

if [ "$PUSH_STATUS" -ne 0 ] || [ "$RECONCILE_STATUS" -ne 0 ]; then
  echo "guarded-db-push: FAILED (push status $PUSH_STATUS, reconciliation status $RECONCILE_STATUS)." >&2
  if [ "$RECONCILE_STATUS" -ne 0 ]; then exit "$RECONCILE_STATUS"; fi
  exit "$PUSH_STATUS"
fi

echo "guarded-db-push: complete. Push succeeded and post-push history reconciled."
