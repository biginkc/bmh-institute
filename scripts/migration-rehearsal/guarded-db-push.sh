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
# LOCK LOSS AFTER ACQUISITION (round-4 finding 2). The lock is confirmed granted
# once, above, then this script runs the gate, the push and reconciliation
# without watching the holder connection. If that connection drops -- killed,
# network blip, an idle timeout on the far side -- PostgreSQL releases the
# session-scoped advisory lock immediately, and a naive wrapper would carry on
# believing it still held exclusive access. assert_lock_still_held re-queries
# pg_locks for the SAME backend pid confirmed above, immediately before the
# push and immediately before reconciliation, and fails closed (exit 75) if it
# is no longer granted, rather than proceeding unprotected on a stale belief.
#
# LOCK LOSS DURING THE PUSH ITSELF (round-5 finding 1). The check above closes
# the window up to the moment the push STARTS, but the Supabase CLI runs as
# its own process on its own connection: once it is running, nothing was
# watching the lock underneath it, so a loss mid-push went undetected until
# the NEXT assert_lock_still_held call, by which point the push had already
# run to completion. run_push_watched backgrounds the push and polls the same
# lock-holder check every ${GUARDED_PUSH_LOCK_WATCH_INTERVAL_SECONDS:-0.3}s
# while it runs; on loss it kills the push immediately instead of letting it
# continue unprotected. This bounds the window to one poll interval rather
# than the push's full (open-ended) duration. It does not reach zero -- a loss
# in the instant between a poll and the CLI's next statement is still
# possible, which is exactly why assert_lock_still_held's own doc above only
# ever claimed to narrow this window, not close it. Closing it fully needs the
# same upstream Supabase CLI feature noted above.
#
# BACKEND PID REUSE (round-5 finding 2). Every lock-held check above and below
# used to trust a bare `pid=${LOCK_BACKEND_PID}` match against pg_locks. If
# the original backend exits and PostgreSQL later reuses that same pid for an
# unrelated session that happens to also hold this advisory lock (extremely
# unlikely, but a bare pid check does not rule it out), the wrapper could
# wrongly conclude it still owns the original lock. Every check now pairs the
# pid with the ORIGINAL backend's `backend_start` timestamp (microsecond
# precision, captured in the same initial query as the pid, via
# lock_still_held_query's `pg_stat_activity` sub-check): a collision now
# requires a reused pid AND an exactly matching start instant, which
# PostgreSQL's pid-allocation behaviour does not produce.
#
# PARTIAL PUSHES. `supabase db push` can apply some migrations and then fail.
# Under a naive `set -e` this script would abort before reconciling and leave the
# database altered with nobody looking. The push status is captured, the
# reconciliation ALWAYS runs, and the worse of the two statuses is propagated.
#
# Usage:
#   export PGHOST=... PGPORT=... PGDATABASE=... PGUSER=... PGPASSWORD=... PGSSLMODE=require
#   export GUARDED_PUSH_EXPECTED_GIT_SHA="$(git rev-parse HEAD)" # production only
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

if [ "$TARGET" = "institute-production" ] && [ -z "${GUARDED_PUSH_EXPECTED_GIT_SHA:-}" ]; then
  echo "guarded-db-push: GUARDED_PUSH_EXPECTED_GIT_SHA is required for production." >&2
  exit 78
fi

assert_expected_sha_is_current_main() {
  [ "$TARGET" = "institute-production" ] || return 0

  local local_sha remote_main_sha worktree_status
  local_sha="$(git rev-parse HEAD)"
  remote_main_sha="$(git ls-remote --exit-code origin refs/heads/main | awk 'NR == 1 { print $1 }')"
  if [ -z "$remote_main_sha" ]; then
    echo "guarded-db-push: could not resolve the current origin/main SHA. Refusing production." >&2
    return 75
  fi
  if [ "$local_sha" != "$GUARDED_PUSH_EXPECTED_GIT_SHA" ] || [ "$remote_main_sha" != "$GUARDED_PUSH_EXPECTED_GIT_SHA" ]; then
    echo "guarded-db-push: tested SHA is no longer the exact current origin/main. Refusing production." >&2
    return 75
  fi
  worktree_status="$(git status --porcelain=v1 --untracked-files=all)"
  if [ -n "$worktree_status" ]; then
    echo "guarded-db-push: worktree differs from the reviewed SHA. Refusing production." >&2
    return 75
  fi
  echo "guarded-db-push: tested SHA is still the exact current origin/main."
  echo "guarded-db-push: worktree exactly matches that reviewed SHA."
}

# ---------------------------------------------------------------------------
# Advisory lock, held for the whole run.
# ---------------------------------------------------------------------------
# Two-int form so pg_locks can be queried directly (objsubid = 2). The key is
# arbitrary but fixed; every sanctioned wrapper uses it.
LOCK_CLASS=778533
LOCK_OBJ=20260730
LOCK_WAIT_SECONDS="${GUARDED_PUSH_LOCK_WAIT_SECONDS:-120}"
LOCK_WATCH_INTERVAL_SECONDS="${GUARDED_PUSH_LOCK_WATCH_INTERVAL_SECONDS:-0.3}"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/bmh-guarded-push.XXXXXX")"
FINGERPRINT="$WORKDIR/fingerprint.json"
LOCK_FIFO="$WORKDIR/lock.fifo"
LOCK_OUT="$WORKDIR/lock.out"
LOCK_PID=""
LOCK_BACKEND_PID=""
LOCK_BACKEND_START=""

# Round-5 finding 2: pairs pid with backend_start so a reused pid alone cannot
# pass. Requires LOCK_BACKEND_PID and LOCK_BACKEND_START to already be set;
# every call site below sets both together before using this. The EXISTS
# subquery (rather than a JOIN) keeps `from pg_locks where locktype='advisory'`
# intact as a literal substring for the existing test coverage that greps for
# it, while adding the backend_start pairing as an additional predicate.
lock_still_held_query() {
  psql --no-psqlrc -X -q -t -A -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_locks where locktype='advisory' and classid=${LOCK_CLASS} \
     and objid=${LOCK_OBJ} and objsubid=2 and granted and pid=${LOCK_BACKEND_PID} \
     and exists (select 1 from pg_stat_activity a where a.pid = pg_locks.pid \
       and a.backend_start = '${LOCK_BACKEND_START}'::timestamptz)" 2>/dev/null || echo 0
}

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
  -c "select backend_start::text from pg_stat_activity where pid = pg_backend_pid()" \
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
  # Round-5 finding 2: both lines must be present -- pid alone is not enough
  # to safely query lock_still_held_query, which also needs backend_start.
  LOCK_BACKEND_PID="$(sed -n '1p' "$LOCK_OUT" 2>/dev/null || true)"
  LOCK_BACKEND_START="$(sed -n '2p' "$LOCK_OUT" 2>/dev/null || true)"
  if [ -n "$LOCK_BACKEND_PID" ] && [ -n "$LOCK_BACKEND_START" ]; then
    HELD="$(lock_still_held_query)"
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
echo "guarded-db-push: advisory lock held by backend pid ${LOCK_BACKEND_PID} (started ${LOCK_BACKEND_START})."

# Round-4 finding 2: re-verify the SAME backend pid still holds the lock,
# rather than trusting the one-time confirmation above for the rest of the
# run. A few short retries absorb the brief window between a backend actually
# terminating and its advisory lock rows clearing from pg_locks; a real loss
# stays absent across all of them and is reported, not raced past.
assert_lock_still_held() {
  local phase="$1"
  local attempt
  for attempt in 1 2 3 4 5; do
    HELD="$(lock_still_held_query)"
    if [ "$HELD" = "1" ]; then
      return 0
    fi
    sleep 0.3
  done
  echo "guarded-db-push: the advisory lock held by backend pid ${LOCK_BACKEND_PID} is GONE," >&2
  echo "checked immediately before ${phase}. The lock-holding connection must have dropped" >&2
  echo "(killed, network blip, an idle timeout) -- PostgreSQL releases a session-scoped" >&2
  echo "advisory lock as soon as its holding connection ends, and this run's exclusivity" >&2
  echo "with other sanctioned wrappers no longer holds. Refusing rather than proceeding" >&2
  echo "unprotected on a stale belief that the lock is still ours." >&2
  exit 75
}

# Round-5 finding 1: assert_lock_still_held only ever checked at a POINT in
# time (immediately before the push starts). The Supabase CLI then runs as
# its own process on its own connection for the push's full duration, during
# which nothing was watching the lock. run_push_watched backgrounds the given
# command, polls lock_still_held_query every LOCK_WATCH_INTERVAL_SECONDS while
# it runs, and kills it immediately on loss instead of letting it continue to
# completion unprotected. This bounds (does not eliminate -- see the header)
# the window to one poll interval.
run_push_watched() {
  "$@" &
  local push_pid=$!
  (
    while kill -0 "$push_pid" 2>/dev/null; do
      sleep "$LOCK_WATCH_INTERVAL_SECONDS"
      kill -0 "$push_pid" 2>/dev/null || break
      HELD="$(lock_still_held_query)"
      if [ "$HELD" != "1" ]; then
        echo "guarded-db-push: the advisory lock was lost WHILE the push was running" >&2
        echo "(pid $push_pid). Killing it immediately rather than letting it continue" >&2
        echo "unprotected." >&2
        kill -TERM "$push_pid" 2>/dev/null || true
        sleep 2
        kill -KILL "$push_pid" 2>/dev/null || true
        break
      fi
    done
  ) &
  local watcher_pid=$!
  local status=0
  wait "$push_pid" || status=$?
  kill "$watcher_pid" 2>/dev/null || true
  wait "$watcher_pid" 2>/dev/null || true
  return "$status"
}

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

# Build the push connection from the SAME variables the gate just used. The
# password remains in PGPASSWORD/SUPABASE_DB_PASSWORD and is deliberately not
# embedded in the --db-url argument, where another process on the runner could
# observe it in argv.
# PGSSLMODE governs the gate's psql connection; the Supabase CLI negotiates TLS
# itself for a hosted --db-url, so the URL is left in the exact form the TEST
# workflow has been using successfully rather than gaining an unverified
# sslmode parameter.
DB_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "::add-mask::$PGPASSWORD"
fi

if [ "$DRY_RUN" = "yes" ]; then
  assert_lock_still_held "the dry-run push"
  assert_expected_sha_is_current_main
  echo "guarded-db-push: gate passed. Running DRY RUN against target '$TARGET'."
  run_push_watched supabase db push --include-all --db-url "$DB_URL" --dry-run
  exit 0
fi

assert_lock_still_held "the push"
assert_expected_sha_is_current_main
echo "guarded-db-push: gate passed. Pushing to target '$TARGET'."
# Timestamp emitted so the harness can MEASURE the verify-to-first-statement
# window rather than anyone asserting it is small.
echo "guarded-db-push: verify complete at $(node -e 'process.stdout.write(String(Date.now()))') ms."

PUSH_STATUS=0
run_push_watched supabase db push --include-all --db-url "$DB_URL" --yes || PUSH_STATUS=$?
if [ "$PUSH_STATUS" -ne 0 ]; then
  echo "guarded-db-push: the push FAILED with status $PUSH_STATUS." >&2
  echo "Reconciling anyway -- a failed push can still have applied part of the set." >&2
fi

# Always reconcile, including after a failed push. A partial application is
# exactly the silent-damage case this whole design exists to catch. Re-check
# the lock here too (round-4 finding 2): if it dropped during the push itself,
# a competing sanctioned wrapper could already be mid-flight, and reconciling
# as though this run still has exclusive access would draw a false conclusion
# from a database another run may now also be touching.
assert_lock_still_held "reconciliation"
echo "guarded-db-push: reconciling post-push history against what the gate authorised."
RECONCILE_STATUS=0
"${GATE[@]}" "--verify-applied=$FINGERPRINT" || RECONCILE_STATUS=$?

if [ "$PUSH_STATUS" -ne 0 ] || [ "$RECONCILE_STATUS" -ne 0 ]; then
  echo "guarded-db-push: FAILED (push status $PUSH_STATUS, reconciliation status $RECONCILE_STATUS)." >&2
  if [ "$RECONCILE_STATUS" -ne 0 ]; then exit "$RECONCILE_STATUS"; fi
  exit "$PUSH_STATUS"
fi

echo "guarded-db-push: complete. Push succeeded and post-push history reconciled."
