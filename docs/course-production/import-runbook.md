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

Production execution also needs `--allow-production`. Rollback additionally needs `--confirm=<import_id>`.

## Safety model

- Identifiers are deterministic from `import_id` and `source_key`.
- Program and course publication are forced off even if input is malformed.
- The release gate requires approved covers, lesson thumbnails, videos, posters, captions, and transcripts.
- Every manifest asset path must stay inside `courses/<import>/v<version>/`, including draft upload and rollback commands. Approved release assets additionally require SHA-256-addressed object paths, preventing an import from overwriting mutable shared files or deleting another import's objects during rollback.
- Uploads validate declared size and SHA-256 when present. Large files use resumable TUS transfers and preserve their resume URLs in ignored `.course-import-state/` state across process restarts.
- Existing storage objects are skipped only when size and stored SHA-256 metadata match the manifest.
- Apply uses deterministic upserts so reruns do not create duplicates.
- Verify compares every manifest-owned database field and confirms the exact storage size and checksum metadata.
- Rollback deletes only identifiers and storage paths derived from the supplied manifest. It first refuses to proceed if it finds learner activity, certificates, or QA-group memberships attached to the import.
- Authentication accounts, audit history, learner activity, and unrelated storage objects are never rollback targets.
