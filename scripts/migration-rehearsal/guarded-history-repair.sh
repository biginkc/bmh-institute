#!/usr/bin/env bash
set -euo pipefail

# The only sanctioned production history-repair entry point. The identity
# check and both mutations are one fail-closed process: if target admission
# fails, strict mode exits before the Supabase CLI is invoked.

if [ "$#" -ne 1 ] || [ "$1" != "--target=institute-production" ]; then
  echo "guarded-history-repair: only --target=institute-production is accepted." >&2
  exit 64
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

for var in PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "guarded-history-repair: $var is required. Refusing to guess a connection." >&2
    exit 78
  fi
done

export SUPABASE_DB_PASSWORD="$PGPASSWORD"
DB_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"

node scripts/migration-rehearsal/check-migration-safety.mjs \
  --target=institute-production --identity-only

# Refuse unless history is still the exact reviewed pre-repair shape. A stale,
# already-repaired, or otherwise divergent database must not be "normalized"
# by replaying these one-time commands.
EXPECTED_HISTORY="$(cat <<'VERSIONS'
011
012
013
014
20260423204031
20260423204130
20260423204205
20260423204222
20260423204234
20260423224651
20260423231622
20260501012728
20260501020518
20260501020537
VERSIONS
)"
ACTUAL_HISTORY="$(
  psql --no-psqlrc -X -q -t -A -v ON_ERROR_STOP=1 \
    -c "select version from supabase_migrations.schema_migrations order by version"
)"
if [ "$ACTUAL_HISTORY" != "$EXPECTED_HISTORY" ]; then
  echo "guarded-history-repair: remote history is not the exact reviewed pre-repair shape. Refusing." >&2
  exit 75
fi

echo "guarded-history-repair: identity matched; reading pre-repair history."
supabase migration list --db-url "$DB_URL"

supabase migration repair \
  001 002 003 004 005 006 007 008 009 010 \
  --status applied --db-url "$DB_URL" --yes
supabase migration repair \
  20260423204031 20260423204130 20260423204205 20260423204222 \
  20260423204234 20260423224651 20260423231622 20260501012728 \
  20260501020518 20260501020537 \
  --status reverted --db-url "$DB_URL" --yes

echo "guarded-history-repair: repair completed; reading post-repair history."
supabase migration list --db-url "$DB_URL"
