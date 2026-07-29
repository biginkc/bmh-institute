#!/bin/sh

# Manual-only operator wrapper. It verifies the four migration bytes before
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

verify_hash 20260728230000_hugo_access_authorization_hardening.sql 2b13e9f511a3cb3a2797174c9e7b37beb9eb00cd79b55318d2bfa997a6e229c8
verify_hash 20260728235900_hugo_missing_identity_durable_proof.sql 00a9403de2a3357094798e9a9bd22c1604666e68286e5fb01962f65a64623d51
verify_hash 20260729001500_hugo_auth_insert_lifecycle_lock.sql 41b3a810997ea932f1e6046e1b353829383789581b3762551d809dd3654a82d8
verify_hash 20260729003000_hugo_auth_email_lifecycle_lock.sql 090addb4f9c8cd5d109a84b05a8db59d60233ed333d90fb689223da4830c8c70

: "${BMH_ROLLBACK_DATABASE_URL:?Set BMH_ROLLBACK_DATABASE_URL to the approved operator/local database URL.}"
exec psql "$BMH_ROLLBACK_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "select pg_advisory_lock(hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)), set_config('bmh.hugo_rollback_confirm', 'I_UNDERSTAND_MANUAL_ONLY', false), set_config('bmh.hugo_rollback_quiesced', 'I_UNDERSTAND_WRITERS_STOPPED', false);" \
  -f "$script_dir/rollback.sql" \
  -f "$script_dir/replay-targets.sql" \
  -f "$script_dir/replay-finalize.sql"
