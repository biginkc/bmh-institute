# Hugo hardening rollback pause

This directory is a manual-only rollback artifact for these four migrations:

- `20260728230000_hugo_access_authorization_hardening.sql`
- `20260728235900_hugo_missing_identity_durable_proof.sql`
- `20260729001500_hugo_auth_insert_lifecycle_lock.sql`
- `20260729003000_hugo_auth_email_lifecycle_lock.sql`

The files are deliberately outside `supabase/migrations`. They are not
included in `supabase db push` and must not be copied into the migration
directory.

Rollback behavior is intentionally conservative. `rollback.sql` requires an
operator confirmation GUC, takes the Hugo lifecycle advisory lock, installs a
restrictive deny-all policy on every existing RLS table, quarantines the two
tables introduced by the authorization migration, restores the reviewed
pre-hardening function definitions, and removes only the four target history
rows. It does not delete identities, profiles, grants, role-group membership,
or business data. The deny gate remains committed after the pause.

After the operator has reviewed the replay output, apply the four target files
in timestamp order and record each migration in the normal migration history.
Then run `replay-finalize.sql` with the same confirmation GUC. It verifies all
four target migrations and the Auth email trigger, restores the quarantined
settings and audit rows, removes only the rollback deny policies, and deletes
the quarantine metadata.

The exact operator command shape is:

```sh
psql "$LOCAL_OR_OPERATOR_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "select pg_advisory_lock(hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)), set_config('bmh.hugo_rollback_confirm', 'I_UNDERSTAND_MANUAL_ONLY', false), set_config('bmh.hugo_rollback_quiesced', 'I_UNDERSTAND_WRITERS_STOPPED', false);" \
  -f scripts/hugo-hardening-rollback/rollback.sql \
  -f scripts/hugo-hardening-rollback/replay-targets.sql \
  -f scripts/hugo-hardening-rollback/replay-finalize.sql
```

The URL is intentionally a placeholder. Do not put credentials in this
directory or in evidence. Before running it, stop Hugo/Auth workers and any
admin or connector writer. The session-level advisory lock and the explicit
quiescence GUC are a required operator contract for the entire rollback,
replay, and finalization pause. Do not run the command against a hosted
project for this work item.

## PostgreSQL 17 proof

The local proof creates a disposable PostgreSQL 17 cluster, applies every
repository migration through `20260728113000`, seeds an owner, learner,
connector grants and operation receipt, role-group membership, a program row,
and a storage object, then applies the four target migrations. It records a
strict-enforcement receipt, runs the rollback pause, proves authenticated reads
and writes are denied while the gate is live, verifies non-target migration
history is unchanged, replays all four migrations atomically with canonical
SQL hashes, rejects an injected extra-row drift while retaining the gate,
finalizes the pause only after per-table and storage policy coverage checks,
and compares exact JSON row snapshots for every public table plus `auth.users`
and `storage.objects` before and after. It also proves the preserved idempotent
receipt is returned after replay.

```sh
npm run test:hugo-hardening:roundtrip
```

The harness is local-only. It never reads credentials or connects to Supabase.
