#!/usr/bin/env bash
set -euo pipefail

# MANDATORY GATE (added 2026-07-30, see the note at the bottom of this file):
# never run the final `db push --linked --include-all --yes` line below without
# first running scripts/migration-rehearsal/check-migration-safety.mjs against
# the SAME connection and getting a clean exit. This script only prints
# commands; it does not enforce the gate for you. Copy the gate invocation from
# the bottom of the printed output into your own shell before the real push.

cat <<'COMMANDS'
# Read-only preflight. Confirm remote has legacy 10 plus numbered 011-014.
supabase migration list --linked

# Repair history only. Mark numbered equivalents applied before removing legacy rows.
# WARNING: this step is exactly what produces NULL-statements placeholder rows
# in supabase_migrations.schema_migrations. Those rows are why the safety gate
# below exists: history that has been repaired is not proof of live content.
supabase migration repair 001 002 003 004 005 006 007 008 009 010 --status applied --linked --yes
supabase migration repair 20260423204031 20260423204130 20260423204205 20260423204222 20260423204234 20260423224651 20260423231622 20260501012728 20260501020518 20260501020537 --status reverted --linked --yes

# Read-only repaired-history and linked push checks.
supabase migration list --linked
supabase db push --linked --include-all --dry-run

# MANDATORY: run the safety gate against this same linked connection before the
# real push. Export PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE for the
# production pooler connection first (do not print the password). The gate
# refuses closed if any schema_migrations row has NULL statements, or if any
# pending migration file is older than the newest version already in history --
# the exact pattern that reverted 6 hardened Hugo functions on 2026-07-30.
# Do not proceed past a nonzero exit from this command for any reason.
node scripts/migration-rehearsal/check-migration-safety.mjs

# STOP. The list must show exactly 001-014 on both sides. The dry run must list
# exactly 015-047 in order. The historical run-002 rehearsal proves 015-039.
# Canonical TEST verification proves 040-045. Capture both outputs and both
# evidence sets before the real push. The safety gate above must also have
# exited 0 for this exact pending list.
supabase db push --linked --include-all --yes
COMMANDS

# Why the gate line is baked into the printed sequence rather than left as a
# separate doc: on 2026-07-30 an automated reconciliation loop ran the
# equivalent of the final `db push --include-all --yes` line above directly
# against production, out of order, because supabase/migrations/20260728091000_hugo_access_provisioner.sql
# had no schema_migrations row. That file's content had already been superseded
# by later hardening migrations; `--include-all` re-applied it anyway and
# reverted 6 functions. See scripts/migration-rehearsal/check-migration-safety.mjs
# for the full mechanism and the two checks it fails closed on.
