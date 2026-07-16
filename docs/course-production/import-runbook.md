# Course import runbook

The course importer is dry-run first. It never publishes a program or course. Production execution needs both `--execute` and `--allow-production`.

## Commands

```bash
npm run course:import -- validate content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- upload content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- apply content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- verify content/course-manifests/bmh-employee-training.v1.json
npm run course:import -- rollback content/course-manifests/bmh-employee-training.v1.json
```

These commands print a plan without changing storage or the database. Add `--execute` only after reviewing the manifest and the printed counts. `apply` and `verify` enforce the release gate. `--canary` requires a separate approved manifest containing only the unpublished Tech Stack slice: one course, one module, one content lesson, optionally its quiz, and no more than ten referenced assets. It cannot relax the full manifest into a draft import.

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
directory identity changes.

Once the report has zero errors and zero blockers, upload from the composite
root:

```bash
npm run course:import -- upload \
  content/course-manifests/bmh-employee-training-canary.v1.json \
  --canary \
  --source-root="$STAGING_ROOT"
```

Rollback the local composite tree with the ownership-checked cleanup command.
It refuses to remove a directory that lacks the tool's marker. This does not
touch source files, storage, or the database:

```bash
npm run course:assets:stage -- cleanup "$STAGING_ROOT"
```

Production execution also needs `--allow-production`. Rollback additionally needs `--confirm=<import_id>`.

## Safety model

- Identifiers are deterministic from `import_id` and `source_key`.
- Program and course publication are forced off even if input is malformed.
- The release gate requires approved covers, lesson thumbnails, videos, posters, captions, and transcripts.
- Every manifest asset path must stay inside `courses/<import>/v<version>/`, including draft upload and rollback commands. Approved release assets additionally require SHA-256-addressed object paths, preventing an import from overwriting mutable shared files or deleting another import's objects during rollback.
- Uploads validate declared size and SHA-256 when present. Large files use resumable TUS transfers and preserve their resume URLs in ignored `.course-import-state/` state across process restarts.
- Existing storage objects are skipped only when size, stored SHA-256 metadata, and exact remote bytes match the manifest.
- Existing and newly uploaded objects are downloaded and hashed before acceptance. Stored metadata alone is not treated as byte-integrity proof.
- Apply uses deterministic upserts so reruns do not create duplicates.
- Verify compares every manifest-owned database field and confirms storage size, checksum metadata, and exact remote bytes.
- Rollback deletes only identifiers and storage paths derived from the supplied manifest. It first refuses to proceed if it finds learner activity, certificates, or QA-group memberships attached to the import.
- Authentication accounts, audit history, learner activity, and unrelated storage objects are never rollback targets.
