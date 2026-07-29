# Hugo hardening rollback pause

This directory is a manual-only rollback artifact for these four migrations:

- `20260728230000_hugo_access_authorization_hardening.sql`
- `20260728235900_hugo_missing_identity_durable_proof.sql`
- `20260729001500_hugo_auth_insert_lifecycle_lock.sql`
- `20260729003000_hugo_auth_email_lifecycle_lock.sql`

It is deliberately obsolete once any later Hugo security migration is
installed. `rollback.sql` refuses all DDL when migration history contains any
later migration whose canonical name starts with `hugo_`. The current final
stack rolls back operationally by leaving the additive schema in place and
disabling Hugo enforcement and launch flags. Do not use this four-migration
database reversal on the final stack.

The files are deliberately outside `supabase/migrations`. They are not
included in `supabase db push` and must not be copied into the migration
directory.

Rollback behavior is intentionally conservative. `rollback.sql` requires an
operator confirmation GUC, takes the Hugo lifecycle advisory lock, installs a
restrictive deny-all policy on every existing RLS table, quarantines the two
tables introduced by the authorization migration, restores the reviewed
pre-hardening function definitions, snapshots ACL metadata for every protected
RLS table plus the protected `auth.users` and `storage.objects` surfaces, and
removes only the four target history rows. It also installs row and
statement-level TRUNCATE pause triggers on the protected tables plus
`auth.users` and `storage.objects`, so service-role writes cannot bypass the
pause. It does not delete identities, profiles,
grants, role-group membership, or business data. The deny gate remains
committed after the pause.

After the operator has reviewed the replay output, apply the four target files
in timestamp order and record each migration in the normal migration history.
Then run `replay-finalize.sql` with the same confirmation GUC. It verifies all
four target migrations and the Auth email trigger, restores the quarantined
settings and audit rows, removes only the rollback deny policies, and deletes
the quarantine metadata.

The exact operator command shape is:

```sh
BMH_ROLLBACK_DATABASE_URL="$LOCAL_OR_OPERATOR_DATABASE_URL" \
  scripts/hugo-hardening-rollback/run-manual.sh
```

The wrapper verifies the exact bytes of both predecessor and all four target
files before opening one psql session, then runs rollback, atomic replay, and
finalization. It rejects embedded credentials and non-local targets unless a
separate operator explicitly sets `BMH_ROLLBACK_ALLOW_REMOTE=I_UNDERSTAND_REMOTE_PAUSE`.
Use a local socket or a credential-free URL resolved through the process-local
`.pgpass`; never place credentials in this directory or evidence. Before
running it, stop Hugo/Auth workers and any admin or connector writer. The
session-level advisory lock and the explicit quiescence GUC are a required
operator contract for the entire rollback, replay, and finalization pause. Do
not run against a hosted project for this work item.

## PostgreSQL 17 proof

The local proof creates a disposable PostgreSQL 17 cluster, applies every
repository migration through `20260728113000`, seeds an owner, learner,
connector grants and operation receipt, role-group membership, a program row,
and a storage object, then applies the four target migrations. It records a
strict-enforcement receipt, runs the rollback pause, proves authenticated reads
and writes plus service-role row writes and TRUNCATEs are denied while the gate
is live, verifies non-target migration history and protected-table ACLs are
unchanged, replays all four migrations atomically with canonical migration
versions and names, rejects an injected extra-row drift while retaining the
gate, finalizes the pause only after per-table and storage policy coverage and
ACL checks, and compares exact JSON row snapshots for every public table plus
`auth.users` and `storage.objects` before and after. It also proves the
preserved idempotent receipt is returned after replay.

```sh
npm run test:hugo-hardening:roundtrip
```

The harness is local-only. It never reads credentials or connects to Supabase.
