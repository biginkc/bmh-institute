#!/usr/bin/env bash
set -euo pipefail

# Production history was repaired and independently rechecked. This historical
# command generator is retained only as a fail-closed tombstone so old runbook
# links cannot revive the one-time mutation path.
echo "Production migration-history repair is retired; no commands were emitted." >&2
echo "Use guarded-db-push.sh for reviewed TEST or production migrations." >&2
exit 64
