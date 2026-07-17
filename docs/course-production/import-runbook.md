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

`upload --execute` writes a completion receipt under
`.course-import-state/upload-receipts/` only after every approved object has
passed exact remote byte and checksum verification. `apply --execute` refuses
to call the database unless that receipt checksum matches the exact manifest
bytes, approved-asset inventory, canonical test/production environment, and
canary/full scope being applied. Always pass the same `--state-root` to upload
and apply. An interrupted upload, stale manifest, or receipt from another scope
or environment must be resumed or uploaded again before apply can proceed.

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
`.course-import-state/rollback-receipts/`; a matching receipt makes retries skip
the database mutation and repeat only the storage inspection. If the database
rows are already completely absent, the receipt records `already_absent`
without claiming that a new database rollback occurred.

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
`020_catalog_artwork_provenance.sql`, and `023_atomic_course_import_apply.sql`
must be verified before any production migration. Do not use the production
project ref. With test-project environment variables loaded, run:

```bash
supabase link --project-ref=<TEST_PROJECT_REF>
supabase db push --dry-run
supabase db push
npm run test:course-import-provider
```

The provider acceptance wrapper refuses to start unless all three
`TEST_SUPABASE_*` values are present and the URL is the canonical non-production
project. It runs atomic apply, atomic rollback, and artwork provenance suites.
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
- Authentication accounts, audit history, learner activity, and unrelated storage objects are never rollback targets.
