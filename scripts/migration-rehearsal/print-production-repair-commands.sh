#!/usr/bin/env bash
set -euo pipefail

cat <<'COMMANDS'
# Read-only preflight. Confirm remote has legacy 10 plus numbered 011-014.
supabase migration list --linked

# Repair history only. Mark numbered equivalents applied before removing legacy rows.
supabase migration repair 001 002 003 004 005 006 007 008 009 010 --status applied --linked --yes
supabase migration repair 20260423204031 20260423204130 20260423204205 20260423204222 20260423204234 20260423224651 20260423231622 20260501012728 20260501020518 20260501020537 --status reverted --linked --yes

# Read-only repaired-history and linked push checks.
supabase migration list --linked
supabase db push --linked --include-all --dry-run

# STOP. The list must show exactly 001-014 on both sides. The dry run must list
# exactly 015-045 in order. The historical run-002 rehearsal proves 015-039.
# Canonical TEST verification proves 040-045. Capture both outputs and both
# evidence sets before the real push.
supabase db push --linked --include-all --yes
COMMANDS
