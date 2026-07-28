# Course import runbook

The course importer is dry-run first. It never publishes a program or course. Production execution needs both `--execute` and `--allow-production`.

## Commands

```bash
npm run course:import -- validate content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- upload content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- apply content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- verify content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- inspect-rollback-storage content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- rollback content/course-manifests/bmh-employee-training.v1.json
```

These commands print a plan without changing storage or the database. Add `--execute` only after reviewing the manifest and the printed counts. `apply` and `verify` enforce the release gate. `--canary` requires a separate approved manifest containing only the unpublished Tech Stack slice: one course, one module, one content lesson, optionally its quiz, and no more than ten referenced assets. It cannot relax the full manifest into a draft import.

### Private full-course review

Use `--review` only with the canonical full BMH course manifest. It allows the
unreleased import to retain explicit review placeholders while keeping every
program and course unpublished. It cannot be combined with a smaller canary or
used to publish content.

```bash
npm run course:import -- validate \
  content/course-manifests/bmh-employee-training.v1.json \
  --review
npm run course:import -- apply \
  content/course-manifests/bmh-employee-training.v1.json \
  --review \
  --execute
npm run course:import -- verify \
  content/course-manifests/bmh-employee-training.v1.json \
  --review \
  --execute
```

The controller must use a service-role session to grant one active owner
reviewer to the exact unpublished imported program. Do not add the reviewer to
the imported QA role group and do not send an invite for that group.

```sql
select public.fn_set_unreleased_import_reviewer_v1(
  '<program-id>'::uuid,
  '<reviewer-user-id>'::uuid,
  true
);
```

An explicit reviewer may open the imported learner path and exercise quizzes,
video playback, assignments, and role plays. The same reviewer may use the
authenticated admin editors that are protected by the imported catalog
boundary. This includes the atomic answer option editor. Ordinary admins may
still review hand-authored or released catalog submissions, but they cannot
see or act on unreleased imported submissions or files. Review activity must
not enqueue or attempt Sandra course completion delivery before release.

If review rejects the import, remove only that reviewer's evidence while the
reviewer grant still proves ownership. The cleanup is service-role-only. It
covers quiz, video, assignment, role-play, progress, completion, certificate,
resume, and suppressed delivery rows owned by that reviewer. It preserves
audit history. It does not make non-reviewer learner activity safe to delete.

Call the cleanup RPC once. If it returns `storage_cleanup_required`, it has not
deleted any database evidence. Its `submission_file_paths` list contains only
exact unshared reviewer objects that still exist. Remove those paths through
the Supabase Storage API with the same service-role controller. Do not delete
from `storage.objects` with SQL because that removes metadata without removing
the provider bytes. Then call the cleanup RPC again. The successful second
call deletes the relational reviewer evidence and revokes reviewer access in
one database transaction. It returns `reviewer_evidence_cleaned` and
`reviewer_access_revoked: true`.

```sql
select public.fn_cleanup_unreleased_import_reviewer_evidence_v1(
  '<import-id>',
  '<reviewer-user-id>'::uuid
);
```

The controller must stop on any RPC or Storage error. Verify every returned
path is absent through the Storage API before the second RPC. Run the normal
dry-run and rollback command only after the successful cleanup has also
revoked access. A
rollback must still stop when any learner activity belongs to a person who was
not an explicit reviewer for that import. Cleanup never weakens the closed
graph, exact ID, external reference, or storage inspection checks.

`upload --execute` writes a completion receipt under
`.course-import-state/upload-receipts/` only after every approved object has
passed exact remote byte and checksum verification. `apply --execute` refuses
to call the database unless that receipt checksum matches the exact manifest
bytes, approved-asset inventory, canonical test/production environment, and
canary/full scope being applied. Always pass the same `--state-root` to upload
and apply. An interrupted upload, stale manifest, or receipt from another scope
or environment must be resumed or uploaded again before apply can proceed.

### Checksum-bound caption evidence

The immutable history in `caption-approvals.json` binds each accessibility
caption to the exact video and VTT SHA-256 values plus its review evidence. A
new video or caption checksum requires a new record; never rewrite or remove a
prior decision. Legacy caption records may retain an internal QA transcript
checksum as historical evidence. Caption-only accessibility records use a null
transcript checksum, and learner-facing manifests must contain no transcript
asset or reference. The manifest builder approves a caption only when one
exact current evidence record matches; otherwise it remains missing.

The six drafted Closer Lab scenarios are deferred from the current course
release while their personas, voices, and scoring behavior receive a separate
fine-tuning pass. The current canonical manifest contains zero role-play blocks,
so its import and publication do not read, create, finalize, or reconcile any
Closer Lab scenario. The pending catalog and mapping ledger are retained only
as future-work artifacts.

When a later release explicitly restores those blocks, the production IDs must
remain null in `closer-lab-production-mapping.json` until the canonical
service-role-only production RPC proves the exact 6-role-play, 6-persona,
24-goal, and 24-link graph. Set `CLOSER_LAB_PRODUCTION_SUPABASE_URL` and
`CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY` from the write-enabled secret runtime,
and set `BMH_INSTITUTE_SCENARIOS_ELEVENLABS_VOICE_ID` to the exact approved
production voice used by all six Closer Lab personas. The finalizer sends a
modern `sb_secret_...` credential only as the Supabase `apikey`; it never sends
an opaque key as a bearer token. Legacy service-role JWTs remain supported only
when their embedded project reference matches the canonical production project.
Then deterministically derive all six manifest and ledger UUID bindings from
that live attestation. Never hand-copy UUIDs from CLI output:

```bash
npm run course:finalize:closer-lab -- \
  --manifest=content/course-manifests/bmh-employee-training.v1.json \
  --mapping-ledger=docs/course-production/closer-lab-production-mapping.json \
  --production-catalog=docs/course-production/closer-lab-production-catalog.json \
  --attestation-output=docs/course-production/closer-lab-production-attestation.json
```

The finalizer validates the complete result before either canonical file is
replaced. Each replacement is atomic, and the command is safely rerunnable if
the process stops between the manifest and ledger renames; its tests cover both
partial-write recovery directions.

After reviewing the exact changed IDs and graph checksum, create the checked
reconciliation evidence without editing its output:

```bash
npm run course:reconcile:closer-lab -- \
  --manifest=content/course-manifests/bmh-employee-training.v1.json \
  --mapping-ledger=docs/course-production/closer-lab-production-mapping.json \
  --production-catalog=docs/course-production/closer-lab-production-catalog.json \
  --output=docs/course-production/closer-lab-production-mapping-reconciliation.json
```

The semantic release gate rejects placeholder IDs, stale manifest or ledger
bytes, duplicate keys, altered evidence bindings, missing production checksums,
and any evidence that is not reproduced by a fresh authenticated read from the
signed canonical Closer Lab production project.

After an applied import, create exact read-only database/storage evidence. This
requires service-role credentials because it inventories the closed managed
graph and downloads approved objects for exact-byte verification, but it does
not write to Supabase:

```bash
npm run course:reconcile -- \
  content/course-manifests/bmh-employee-training.v1.json \
  --execute \
  --output=.course-import-state/reconciliation/bmh-employee-training-v1.json
```

Add `--canary` for the deterministic Tech Stack manifest and
`--allow-production` only for the canonical production project. Evidence is
emitted only when planned fields match, all thirteen managed table inventories
(including direct `course_access`) have exact closed-graph keys and no extras,
the catalog checksum is valid, every approved object matches its size,
metadata, and bytes, and no unexpected object exists below the exact import
storage prefix. The evidence checksum is deterministic for identical observed
state. The regular `course:import -- verify ... --execute` command enforces the
same no-drift rule and exits with an error on any extra database row or storage
object.

Manifest asset paths are relative to the repository root by default. If the approved source files live in another checkout, add `--source-root=/absolute/path/to/that/repository-root` to `upload`—the directory must contain the manifest's `course-assets/...` paths, not be the `course-assets` directory itself. The importer resolves real paths and rejects files that escape that root.

### Composite asset staging

The release manifest intentionally draws from two checkouts: generated guides,
captions, transcripts, and artwork live in the integration checkout, while the
large approved source videos live in the canonical course checkout. Never copy
one checkout over the other or point the importer at an incomplete root.

Build one verified local source root first. Pass trusted roots in priority order:
the integration checkout first, then the canonical checkout. `check` is a
no-write preflight. `stage` creates only the explicitly named staging tree and
prefers an independent copy-on-write clone, with a byte-for-byte copy fallback
when cloning is not available. Staged files never share an inode with a source
file.

```bash
INTEGRATION_ROOT="/absolute/path/to/institute-complete-course-v1"
CANONICAL_ROOT="/absolute/path/to/BMH Institute"
STAGING_ROOT="$INTEGRATION_ROOT/.course-import-state/asset-stage/bmh-employee-training-canary-v1"

npm run course:assets:stage -- check \
  content/course-manifests/bmh-employee-training.v1.json \
  --source-root="$INTEGRATION_ROOT" \
  --source-root="$CANONICAL_ROOT" \
  --report="$INTEGRATION_ROOT/.course-import-state/asset-stage/full-check.json"

npm run course:assets:stage -- stage \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --source-root="$INTEGRATION_ROOT" \
  --source-root="$CANONICAL_ROOT" \
  --staging-root="$STAGING_ROOT" \
  --report="$INTEGRATION_ROOT/.course-import-state/asset-stage/canary-stage.json"
```

The JSON report lists the selected root and verified size/SHA-256 for every
approved asset. A repeated relative path with different bytes is an error even
when the first root matches the manifest. Traversal, an outside-root symlink,
an absent approved asset, or a manifest checksum/size mismatch fails closed.
Assets marked `hold` or `missing` are blockers and are never materialized.
Exit code `1` means an integrity/safety error; exit code `2` means only approval
or missing-asset blockers remain. Rerunning `stage` reuses only staged files
whose bytes still match the manifest.

The ownership marker pins the staging tree's canonical path, device, and inode.
Reuse and cleanup fail closed if a symlink ancestor is repointed or the owned
directory identity changes. Cleanup first atomically renames the owned tree to
a unique quarantine path beside it. It verifies the captured device and inode
after that rename, then preserves the quarantine and reports its path for
manual inspection. It does not recursively delete after the final identity
check because an attacker could replace descendants between that check and a
path-based deletion.

Once the report has zero errors and zero blockers, upload from the composite
root:

```bash
npm run course:import -- upload \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --source-root="$STAGING_ROOT" \
  --execute

npm run course:import -- apply \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --execute

npm run course:import -- verify \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --execute

npm run course:import -- inspect-rollback-storage \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --execute \
  --confirm=bmh-employee-training-canary-v1

npm run course:import -- rollback \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --execute \
  --confirm=bmh-employee-training-canary-v1
```

Run this exact sequence only against the canonical disposable test project.
`inspect-rollback-storage` is read-only and can be rerun before or after database
rollback. Database rollback writes an atomic receipt under
`.course-import-state/rollback-receipts/` keyed by import, canary or full scope,
and the exact test or production environment. A matching receipt makes retries skip
the database mutation and repeat only the storage inspection. If the database
rows are already completely absent, the receipt records `already_absent`
without claiming that a new database rollback occurred.

The receipt is a controller-exclusive snapshot, not a cross-controller lock or
deletion authorization. Do not run another apply, rollback, or catalog writer
for the same import until the rehearsal and its final exact verification have
finished. Receipt reuse rechecks the live database before trusting the snapshot.
Storage `manual_review_candidates` are advisory only: no object is deleted, and
the report must be re-verified immediately before any separately approved
cleanup because the provider does not expose a conditional version-bound delete.

Quarantine the local composite tree with the ownership-checked cleanup command.
It refuses to move a directory that lacks the tool's marker. This does not
touch source files, storage, or the database. Inspect and separately remove the
reported quarantine path only in a trusted maintenance context:

```bash
npm run course:assets:stage -- cleanup "$STAGING_ROOT"
```

Production execution also needs `--allow-production`. Rollback additionally needs `--confirm=<import_id>`.

### Test-project migration verification

The complete migration list must match the disposable project. In particular,
`018_storage_content_markdown.sql`, `019_atomic_course_import_rollback.sql`,
`020_catalog_artwork_provenance.sql`, `023_atomic_course_import_apply.sql`,
`027_import_release_control.sql` through
`045_fix_submission_self_storage_policy.sql`
must be verified before any production migration. Do not use the production
project ref. Load the exact canonical TEST database URL first. The validation
command must succeed before either push command can start:

```bash
node -e 'const u=new URL(process.env.TEST_SUPABASE_DB_URL); const ok=u.protocol==="postgresql:"&&u.username==="postgres.jvaabkchkihkjllehmft"&&u.password&&u.hostname==="aws-1-us-west-1.pooler.supabase.com"&&u.port==="5432"&&u.pathname==="/postgres"&&!u.search&&!u.hash; if(!ok) process.exit(1)'
supabase db push --db-url "$TEST_SUPABASE_DB_URL" --include-all --dry-run
# Stop unless the dry run lists only the expected pending TEST migrations.
supabase db push --db-url "$TEST_SUPABASE_DB_URL" --include-all --yes
npm run test:course-import-provider
```

The provider acceptance wrapper refuses to start unless the HTTP URL, direct
database URL, anon key, and service-role key are present. The HTTP and database
targets must identify the canonical non-production project and each key must
have its expected role. It runs atomic apply, atomic rollback, and artwork
provenance suites.
Together they prove idempotent apply, exact reconciliation, complete rollback,
unknown-ID and external-dependent refusal, QA-group invite blocking, provenance
immutability, and service-role-only function access. The wrapper parses Vitest's
machine report and fails unless all three files contain nonzero executed tests
with zero skips, todos, or failures. A skipped suite is not acceptance evidence;
all provider tests must execute and pass.

Then confirm the bucket kept its prior allowlist and added Markdown exactly once:

```sql
select allowed_mime_types,
       array_length(allowed_mime_types, 1) as mime_count
from storage.buckets
where id = 'content';
```

Run the same query again after a second test migration pass. `text/markdown`
must appear once and the count must not change. Finally upload the canary
manifest to that test project and run importer verification before scheduling
any production migration.

### Andrea Oral Check pilot deployment (3 migrations: `20260728020000` / `20260728030000` / `20260728050000`)

This is a standalone, one-shot change (PR #130) that inserts 3 `role_play`
blocks bound to 3 real, live Closer Lab scenario IDs into 3 already-published
lessons. It is separate from the general course importer above and from the
versioned content-block-revision system
(`claude/versioned-content-block-revision-v2`, PR #128, parked). It is split
across 3 migrations, applied in this exact order (Supabase applies each
migration file as its own transactional batch, and round-4 review's finding
1 is specifically about what can go wrong if this order is violated —
never apply these out of order or skip one):

1. **`20260728020000_insert_oral_check_pilot_role_play_blocks.sql`** — installs
   `fn_insert_oral_check_pilot_role_play_blocks()` and its evidence table.
   Makes NO live catalog changes on its own; it only defines the function.
2. **`20260728030000_rollback_oral_check_pilot_role_play_blocks.sql`** —
   installs the forward-rollback capability (see step 4 below) BEFORE the
   forward insertion is ever allowed to run. Also makes no live catalog
   changes on its own.
3. **`20260728050000_apply_oral_check_pilot_role_play_blocks.sql`** — the
   only one of the three that actually mutates the live catalog. It asserts
   both `fn_insert_oral_check_pilot_role_play_blocks()` and the rollback
   capability from step 2 exist, then performs the actual guarded,
   one-shot-refusing insertion. If this migration is ever applied without
   step 2 having already committed, it refuses outright (SQLSTATE 55000)
   rather than inserting the 3 blocks with no rollback path prepared — this
   is what makes the deployment order self-enforcing at the SQL level, not
   just a runbook convention. It also FAILS CLOSED (SQLSTATE 55000) when the
   `bmh-employee-training-v1` catalog exists on the target but has no
   published release record. That covers an incomplete restore, a catalog reloaded
   after migration replay, or an import that was applied but never released.
   Round-5 review caught that the original design silently no-op-succeeded
   in that case; round-6 review then caught that raising on EVERY absent
   release was too blunt, because this file ships in `supabase/migrations/`
   and so runs on every clean-database replay (`supabase db reset`, CI, a
   fresh preview or test project), which by definition has no release
   record. It now skips with a NOTICE only when the target holds no
   `bmh-employee-training-v1` catalog at all, and still refuses when the
   catalog is there without a release. That leaves one gap, a push aimed at
   a wrong and entirely empty project skipping quietly, and it is closed by the
   target preflight in step 3 and the receipt postflight in step 3b, which
   are the layers that can actually see which project you are connected to.

   Round-5 review also moved the SAME rollback-capability assertion INSIDE
   `fn_insert_oral_check_pilot_role_play_blocks()` itself (in
   `20260728020000`) and deferred that function's `EXECUTE` grant to
   `service_role` until `20260728030000` installs the rollback capability.
   This means the ordering guarantee no longer depends solely on this
   wrapper migration — a direct RPC or raw SQL call to the insertion
   function is refused the same way, and until `20260728030000` commits, no
   role can call it at all.

Before applying any of the three:

1. **Local verification** (already covered by CI): `run-controller-gate-pr-harness.mjs`
   test 056 exercises the real insertion and one-shot-refusal path, and
   test 057 exercises the real rollback path, both against a local PG
   cluster seeded from real production catalog rows.
2. **MANDATORY gate — run the live recheck against production, credentialed,
   immediately before applying the migration:**

   ```bash
   BMH_INSTITUTE_ALLOW_LIVE_CLOSER_LAB_VERIFICATION=1 \
     CLOSER_LAB_PRODUCTION_SUPABASE_URL=https://xqrkugdxpwhjscrheuqo.supabase.co \
     CLOSER_LAB_PRODUCTION_SERVICE_ROLE_KEY=... \
     node --test content/course-manifests/oral-check-pilot-production-attestation.qa.test.mjs
   ```

   This is not optional and not a formality: it deep-compares the live
   Closer Lab `role_plays` → `personas` → `role_play_goals` → `rubric_goals`
   → `rubric_goal_documents` graph against the checked-in attestation
   (`docs/course-production/oral-check-pilot-production-attestation.json`),
   field-for-field — role-play title, persona identity, and each individual
   rubric goal's id/name/order/weight/document count, not just totals and
   counts. Round-3 Codex review of PR #130 found the pre-fix version of this
   test would pass cleanly even if the 4 attached goals for a scenario had
   been silently swapped for 4 different goals that happened to also sum to
   weight 100 — learners would be scored against the wrong rubric with a
   fully "green" test. It only runs opt-in, credentialed, and is otherwise
   skipped in normal CI. If it fails, stop — do not apply the migration
   until the attestation is reconciled with the live state or the mismatch
   is understood and fixed forward.
3. **Target preflight (do this before every apply, not just the first
   time):** prove the connection is genuinely the Institute production
   project (`dhvfsyteqsxagokoerrx`) before running anything. Run this against
   the exact same connection string you are about to migrate with, and only
   proceed if it prints `preflight ok`:

   ```sql
   do $$
   declare
     v_project_ref constant text := 'dhvfsyteqsxagokoerrx';
     v_import_id constant text := 'bmh-employee-training-v1';
     v_expected_manifest_sha256 constant text :=
       '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c';
     v_expected_catalog_sha256 constant text :=
       '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2';
     v_live_catalog_sha256 text;
   begin
     if current_user <> 'postgres.' || v_project_ref then
       raise exception 'target preflight failed: connected as %, expected postgres.% (connect through the Supabase pooler URL for this project, which is what supabase db push uses)',
         current_user, v_project_ref;
     end if;

     if not exists (
       select 1 from public.content_import_release_records
       where import_id = v_import_id
         and program_id = '15a382c9-617c-5407-a880-af6303be74b2'
         and manifest_sha256 = v_expected_manifest_sha256
     ) then
       raise exception 'target preflight failed: this database has no % release record matching the exact production program and manifest pin. Wrong target, incomplete restore, or the catalog was never released.',
         v_import_id;
     end if;

     v_live_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
     if v_live_catalog_sha256 <> v_expected_catalog_sha256 then
       raise exception 'target preflight failed: live catalog hashes to %, the migration is pinned to %. Either this is not the production catalog, or production has drifted since the pin was taken and the migration must be re-authored.',
         v_live_catalog_sha256, v_expected_catalog_sha256;
     end if;

     if exists (
       select 1 from public.content_import_oral_check_pilot_role_play_records
       where import_id = v_import_id
     ) then
       raise exception 'target preflight failed: the pilot insertion receipt already exists on this target. This is a one-shot operation and has already been performed.';
     end if;

     raise notice 'preflight ok: % catalog on project %, live hash matches the migration pin, pilot not yet applied',
       v_import_id, v_project_ref;
   end;
   $$;
   ```

   Do not substitute `supabase status` here. It reports the LOCAL Supabase
   stack and cannot say anything about which remote project a connection
   points at, so it can report a perfectly healthy local environment while
   you are pointed somewhere else entirely. The block above interrogates the
   target itself: `current_user` on the Supabase pooler carries the project
   ref directly, and the release pin plus the live catalog hash are facts
   only the real Institute production catalog satisfies. If it raises for any
   reason, STOP. Do not proceed to step 3a. `20260728050000` will also refuse
   on its own if this database holds the catalog with no release record
   (SQLSTATE 55000), but do not rely on that alone. A `supabase db push`
   aimed at a wrong and entirely empty project skips quietly by design, so
   this preflight and the step 3b postflight are what catch it.
3a. Apply the 3 migrations to production in numeric order (`20260728020000`,
   then `20260728030000`, then `20260728050000`) — this is the normal
   `supabase db push` behavior since they sort in that order by filename,
   but if applying by hand, do not reorder them. The actual insertion
   (in `20260728050000`) is atomic, hash-pinned CAS against the exact
   expected prior catalog state, and refuses a second invocation
   (SQLSTATE 40001).
3b. **Receipt and block postflight (do this immediately after `20260728050000`
   commits):** confirm the exact evidence row and the exact 3 rows exist,
   not just that `supabase db push` reported success:

   ```sql
   select import_id, prior_catalog_sha256, replacement_catalog_sha256,
     database_payload_sha256, role_play_insert_count
   from public.content_import_oral_check_pilot_role_play_records
   where import_id = 'bmh-employee-training-v1';
   -- expect exactly 1 row, role_play_insert_count = 3

   select id, lesson_id, block_type, sort_order, is_required_for_completion
   from public.content_blocks
   where id in (
     '7300bba9-a9fc-582c-aa20-dd5d58754165',
     '4464ecdd-2650-59ed-a525-78871e846d20',
     '34758403-1ddd-5e3c-a054-b2f28310d8b8'
   )
   order by id;
   -- expect exactly 3 rows, block_type = 'role_play', is_required_for_completion = true
   ```

   A green migration run alone is not sufficient confirmation for this
   change — verify the receipt and the 3 rows directly, every time.
4. If a rollback becomes necessary after `20260728050000` has committed, the
   forward-rollback capability installed by `20260728030000` is already in
   place, ready but never auto-invoked:
   `supabase/migrations/20260728030000_rollback_oral_check_pilot_role_play_blocks.sql`
   defines `public.fn_rollback_oral_check_pilot_role_play_blocks()`,
   rehearsed end-to-end against a real database state with the insertion
   already applied in
   `supabase/tests/057_oral_check_pilot_role_play_rollback.sql`. Do not
   invent privileged SQL live during an incident — connect with
   service-role credentials and run:

   ```sql
   begin;
   set local lock_timeout = '10s';
   select set_config('request.jwt.claim.role', 'service_role', true);
   select public.fn_rollback_oral_check_pilot_role_play_blocks();
   commit;
   ```

   The `set_config` line is not optional and not decoration. The function's
   first check is `auth.role() = 'service_role'`, and `auth.role()` reads the
   `request.jwt.claim.role` setting on the current session. PostgREST sets
   that automatically for RPC calls, but a direct `psql` session does not, so
   without this line the documented procedure fails immediately with SQLSTATE
   42501 ("Oral-check pilot role-play rollback requires service_role"),
   during a real incident, against 3 live published lessons. Holding
   service-role database credentials is not the same thing as presenting the
   claim. `true` scopes the setting to this transaction, so it reverts on
   `COMMIT`. This is the same thing
   `20260728050000_apply_oral_check_pilot_role_play_blocks.sql` does before
   calling the forward function.

   The function itself already sets a `10s` `lock_timeout` for the
   duration of every call (round-5 review caught that the migration-level
   `set lock_timeout = '10s'` near the top of
   `20260728030000_rollback_oral_check_pilot_role_play_blocks.sql` only
   ever applied to the session that INSTALLED that migration, not to a
   later incident invocation, which would otherwise wait indefinitely
   behind a busy writer with Postgres's default `lock_timeout = 0`) — the
   explicit `BEGIN; SET LOCAL lock_timeout = '10s'; ...; COMMIT;` wrap above
   is defense in depth on top of that, not a substitute for it.

   It pins itself to the forward operation's own immutable evidence row
   (not a second hand-guessed catalog-hash constant), refuses if the live
   catalog or the 3 target rows have drifted since the pilot insertion,
   refuses if real learner activity exists against any of the 3 blocks
   (role_play_results, user_block_progress, user_video_progress,
   user_video_completion_history, or user_course_resume — the same 5-table
   check `20260722032500_prune_deferred_role_play_blocks.sql` uses for the
   analogous "remove role-play blocks safely" operation) rather than
   silently cascade-deleting it or hitting an opaque foreign-key error,
   removes exactly the 3 inserted rows, verifies the catalog hash is
   restored to the exact pre-insert value, and records its own immutable
   rollback evidence row
   (`content_import_oral_check_pilot_role_play_rollback_records`). It is
   genuinely one-shot: a second invocation is refused unconditionally.

## Safety model

- Identifiers are deterministic from `import_id` and `source_key`.
- Program and course publication are forced off even if input is malformed.
- The release gate requires approved covers, lesson thumbnails, videos, posters, captions, and transcripts.
- Every manifest asset path must stay inside `courses/<import>/v<version>/`, including draft upload and rollback commands. Approved release assets additionally require SHA-256-addressed object paths, preventing an import from overwriting mutable shared files or deleting another import's objects during rollback.
- Every approved upload requires an exact size, lowercase SHA-256, and checksum-addressed storage path, including draft upload commands. Large files use resumable TUS transfers and preserve their resume URLs in ignored `.course-import-state/` state across process restarts.
- TUS resume-state updates use a cross-process lock and an fsynced temporary-file rename. Concurrent import processes cannot overwrite one another's resume URLs, stale crash locks are recovered, and malformed state fails closed instead of silently starting over.
- Upload considers only assets whose `approval_status` is `approved`. Held and missing assets make no storage or TUS calls.
- Resume fingerprints include the normalized active Supabase resumable endpoint, bucket, checksum, and storage path. Stored resume state must also match the current size, bucket, path, checksum, content type, and import when applicable. Endpoints require HTTPS except for explicit loopback development hosts. Stored resume URLs are accepted only on that exact origin and under its resumable route. Every outgoing TUS request is checked again before authorization can be sent.
- Each upload reads every chunk from one verified open inode. The snapshot pathname is removed after pinning so source mutation or a replacement file between chunks cannot change uploaded bytes.
- Existing storage objects are skipped only when size, stored SHA-256 metadata, and exact remote bytes match the manifest.
- Existing and newly uploaded objects are downloaded and hashed before acceptance. Stored metadata alone is not treated as byte-integrity proof.
- A new object that fails exact post-upload verification is preserved. The storage API does not provide a conditional delete that can prove the ownership metadata still belongs to the same object at deletion time.
- Apply uses deterministic upserts so reruns do not create duplicates.
- Verify compares every manifest-owned database field and confirms storage size, checksum metadata, and exact remote bytes.
- Verify reads use bounded ID batches so large manifests do not create oversized PostgREST filters.
- Database rollback sends each deterministic ID together with its source key to one service-role-only database function. Migration 019 predates the explicit `content_import_id` columns in migration 020, so it proves provenance by recomputing every UUID from `import_id + source_key` and requiring a complete closed catalog graph. This assumes the import was applied through the deterministic importer; hand-created rows that deliberately reuse those exact derived IDs are outside the rollback contract. The function locks every catalog and dependent table, rejects missing IDs and QA-group invite overlap, checks learner activity, certificates, memberships, and unexplained dependents, then verifies every actual per-table delete count in the same transaction.
- Storage rollback automatically deletes nothing because the storage API has no conditional delete. It inspects approved objects only and reports exact import-owned, size-matched, checksum-matched objects as manual cleanup candidates; uncertain, raced, held, missing, or unrelated objects are preserved.
- Storage inspection is an independent read-only command. Database rollback records an atomic plan-bound receipt and verifies the rows remain absent before reusing it, so retries do not repeat a completed mutation or trust a stale receipt blindly.
- Reviewer evidence cleanup is service-role-only and exact-import scoped. It
  accepts only a current explicit reviewer on the sole unpublished import. Its
  Storage API preflight changes no database evidence. After exact unshared
  objects are absent, relational cleanup and access revocation are atomic.
  Non-reviewer learner activity continues to block rollback.
- Authentication accounts, non-reviewer audit history, non-reviewer learner activity, and unrelated storage objects are never rollback targets.
