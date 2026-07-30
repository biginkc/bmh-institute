#!/usr/bin/env bash
set -euo pipefail

# Prints the production history-repair sequence.
#
# This script deliberately does NOT print a bare
# `supabase db push --linked --include-all --yes`. It used to, with the safety
# gate printed above it as a separate line and nothing chaining the two. An
# operator (or an agent loop pasting the block) could run the push and skip the
# gate, which is exactly the 2026-07-30 failure. The only push line printed now
# is scripts/migration-rehearsal/guarded-db-push.sh, which runs the gate itself
# and aborts on a non-zero exit, so the push is unreachable without the gate.

cat <<'COMMANDS'
# 0. Export the production connection ONCE. Both the gate and the push are built
#    from these exact variables, so they cannot end up pointing at different
#    databases. Do not echo PGPASSWORD.
#    PGHOST: copy the pooler host from the Supabase dashboard for project
#    dhvfsyteqsxagokoerrx (bmh-institute, us-east-1). Do not guess it.
export PGHOST="<production pooler host>"
export PGPORT="5432"
export PGDATABASE="postgres"
export PGUSER="postgres.dhvfsyteqsxagokoerrx"
export PGPASSWORD="<production db password>"
export PGSSLMODE="require"

# 1. Read-only preflight. Confirm remote has legacy 10 plus numbered 011-014.
supabase migration list --linked

# 2. Repair history only. Mark numbered equivalents applied before removing legacy rows.
#    WARNING: this step CREATES NULL-statements placeholder rows in
#    supabase_migrations.schema_migrations. The safety gate refuses on any
#    placeholder row that is not in the acknowledged baseline, so this step and
#    step 3 belong together -- see step 3.
supabase migration repair 001 002 003 004 005 006 007 008 009 010 --status applied --linked --yes
supabase migration repair 20260423204031 20260423204130 20260423204205 20260423204222 20260423204234 20260423224651 20260423231622 20260501012728 20260501020518 20260501020537 --status reverted --linked --yes

# 3. Acknowledge the placeholder rows you just created. Run the gate; it will
#    refuse with E21 and print a paste-ready version array. Before pasting it,
#    confirm the LIVE definitions of the objects those migrations touch (e.g.
#    pg_get_functiondef), because a placeholder row proves nothing about them.
#    Then paste into scripts/migration-rehearsal/placeholder-baseline.json under
#    targets["institute-production"].placeholder_versions, update
#    acknowledged_at, and COMMIT that change. This edit is intentionally manual,
#    and committing it is mandatory rather than tidy: the gate reads the baseline
#    out of git HEAD, never from the working tree, so an uncommitted edit has no
#    effect at all. Automation must not be able to acknowledge its own repair rows.
node scripts/migration-rehearsal/check-migration-safety.mjs --target=institute-production --enforce-canonical-paths

# 4. Read-only repaired-history and push checks. The dry run goes through the
#    same wrapper so it uses the same target definition as the real push.
supabase migration list --linked
bash scripts/migration-rehearsal/guarded-db-push.sh --target=institute-production --dry-run

# 5. STOP. The list must show exactly 001-014 on both sides. The dry run must list
#    exactly the pending set you expect, in order. The historical run-002
#    rehearsal proves 015-039. Canonical TEST verification proves 040-045.
#    Capture both outputs and both evidence sets before the real push.
#
#    The line below is the ONLY sanctioned production push. It re-runs the
#    safety gate against this same connection and aborts on a non-zero exit; do
#    not substitute a bare `supabase db push --include-all` for it.
bash scripts/migration-rehearsal/guarded-db-push.sh --target=institute-production
COMMANDS

# Why the push is a wrapper rather than a printed command plus a printed gate:
# on 2026-07-30 an automated reconciliation loop ran the equivalent of a bare
# `db push --include-all --yes` directly against production, out of order,
# because supabase/migrations/20260728091000_hugo_access_provisioner.sql had no
# schema_migrations row. That file's content had already been superseded by
# later hardening migrations; `--include-all` re-applied it anyway and reverted
# 6 functions. A gate that is merely printed next to the dangerous command is
# not a gate. See scripts/migration-rehearsal/check-migration-safety.mjs for the
# full mechanism and the complete enumeration of its fail-closed exit paths.
