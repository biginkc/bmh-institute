#!/bin/sh

# Manual-only operator wrapper. It verifies all six migration bytes before
# opening one psql session for rollback, atomic replay, and finalization.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)

verify_hash() {
  file=$1
  expected=$2
  actual=$(shasum -a 256 "$repo_root/supabase/migrations/$file" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    printf 'Hugo rollback refused: canonical hash mismatch for %s\n' "$file" >&2
    exit 1
  fi
}

verify_hash 20260728091000_hugo_access_provisioner.sql 600a00acf7c97c611ad314c9cc9e0eea905e4d61f40ba5745d5428aedb61124b
verify_hash 20260728113000_hugo_access_operation_payload_hash.sql 2d3c47e46e3b5584698ee1817aec490cb385d23d693219667c7e2912fb853625
verify_hash 20260728230000_hugo_access_authorization_hardening.sql b60fe0f13a27c8815c36d9b4c6a2bb6a6ae9c3e11702c6d948f750860837ef0e
verify_hash 20260728235900_hugo_missing_identity_durable_proof.sql 00a9403de2a3357094798e9a9bd22c1604666e68286e5fb01962f65a64623d51
verify_hash 20260729001500_hugo_auth_insert_lifecycle_lock.sql 41b3a810997ea932f1e6046e1b353829383789581b3762551d809dd3654a82d8
verify_hash 20260729003000_hugo_auth_email_lifecycle_lock.sql 3c459ca8e25cd139dd86ec86cc1e39d1a1f7bce85ddc8faa18716b36656d32ce

: "${BMH_ROLLBACK_DATABASE_URL:?Set BMH_ROLLBACK_DATABASE_URL to the approved operator/local database URL.}"
case "$BMH_ROLLBACK_DATABASE_URL" in
  *password=*|*PWD=*|*://*@*)
    printf 'Hugo rollback refused: database URL must not contain embedded credentials.\n' >&2
    exit 1
    ;;
esac

# A bare `dbname=...` connection string can still resolve through PGHOST or
# PGSERVICE. Treat service indirection as non-local unless the operator opts in;
# a service name alone cannot prove which endpoint its config selects.
nonlocal_env=0
case "${PGHOST:-}" in
  ''|localhost|127.0.0.1|::1|/tmp/*) ;;
  *) nonlocal_env=1 ;;
esac
case "${PGHOSTADDR:-}" in
  ''|localhost|127.0.0.1|::1) ;;
  *) nonlocal_env=1 ;;
esac
if [ -n "${PGSERVICE:-}" ]; then
  nonlocal_env=1
fi

local_target=0
case "$BMH_ROLLBACK_DATABASE_URL" in
  # URI authority is explicit and credential-free after the check above.
  postgresql://localhost/*|postgresql://localhost|postgres://localhost/*|postgres://localhost|\
  postgresql://localhost:*|postgres://localhost:*|\
  postgresql://127.0.0.1/*|postgresql://127.0.0.1|postgres://127.0.0.1/*|postgres://127.0.0.1|\
  postgresql://127.0.0.1:*|postgres://127.0.0.1:*|\
  postgresql://\[::1\]/*|postgresql://\[::1\]|postgres://\[::1\]/*|postgres://\[::1\]|\
  postgresql://\[::1\]:*|postgres://\[::1\]:*)
    local_target=1
    ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" host=localhost "*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" host=127.0.0.1 "*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" host=::1 "*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" host=/tmp/"*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" hostaddr=localhost "*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" hostaddr=127.0.0.1 "*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  *" hostaddr=::1 "*) local_target=1 ;;
esac
case " $BMH_ROLLBACK_DATABASE_URL " in
  # No host means libpq's default Unix socket, but only when no environment
  # setting can redirect that default to a remote endpoint.
  " dbname="*) local_target=1 ;;
esac

if [ "$local_target" -ne 1 ] || [ "$nonlocal_env" -ne 0 ]; then
  if [ "${BMH_ROLLBACK_ALLOW_REMOTE:-}" != "I_UNDERSTAND_REMOTE_PAUSE" ]; then
    printf 'Hugo rollback refused: non-local targets require explicit operator override.\n' >&2
    exit 1
  fi
fi
exec psql "$BMH_ROLLBACK_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "select pg_advisory_lock(hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)), set_config('bmh.hugo_rollback_confirm', 'I_UNDERSTAND_MANUAL_ONLY', false), set_config('bmh.hugo_rollback_quiesced', 'I_UNDERSTAND_WRITERS_STOPPED', false);" \
  -f "$script_dir/rollback.sql" \
  -f "$script_dir/replay-targets.sql" \
  -f "$script_dir/replay-finalize.sql"
