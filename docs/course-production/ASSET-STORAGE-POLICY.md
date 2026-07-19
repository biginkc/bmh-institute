# Course production asset storage policy

Updated: 2026-07-17

## Current decision

The current course-production binaries remain ordinary Git objects for this
release. Do not rewrite binary history merely to change storage, remove lineage
archives, or add Git LFS filters during the release branch. A separately
controlled security scrub of unrelated sensitive text is not an asset-storage
migration and must preserve every required binary byte and provenance check.

The production artwork ledger deliberately binds local source, correction,
reference, flat-master, derivative-history, and archived lineage files by path
and SHA-256. The artwork validator opens those files and verifies their bytes.
The tracked lineage directories are therefore release evidence, not disposable
build output.

The ledger alone names 235 archived binary paths totaling approximately
70.8 MiB. With file inspection enabled, the validator opens every one of those
paths and compares its checksum to the recorded lineage or derivative history.
It also opens the active generated sources, flat masters, final derivatives,
approved pilot sources, style references, video contact sheets, and review
evidence that bind the current production state. Removing or pointer-replacing
any of those files without changing the validator contract breaks provenance
verification. Older pilot revisions and design exploration files that are not
named by the current production ledger may be cleanup candidates, but this
review does not prove them safe to delete: some remain historical review
evidence, and deletion is outside the release boundary.

The review surface reported approximately 121.9 MiB of binary history. A fresh
local measurement attributes approximately 122.9 MiB of binary additions to
this branch; the complete repository object pack is approximately 123.5 MiB.
The tracked course-asset, design, and artwork-review trees occupy approximately
156.3 MiB uncompressed. Approximately 67.9 MiB of that working-tree total is in
the production thumbnail and poster lineage directories. These measurements
are a 2026-07-17 snapshot, not a storage quota.

## Guard for this release

- Do not commit another generated binary revision or lineage archive unless it
  is required to correct an acceptance-blocking defect.
- Before such an exception, record the new file count and byte growth, identify
  the ledger records that require the bytes, and rerun the complete artwork
  workflow validation.
- Keep large source videos outside Git. The manifest may reference their local
  and immutable storage paths and checksums; it must not turn Git into the video
  delivery store.
- Treat `.gitattributes` entries as diff-display metadata only. They intentionally
  contain no LFS filter, so a checkout needs no uninstalled filter driver and CI
  continues to receive the real bytes.

This is a freeze on further binary growth, not an automatic size check. A hard
CI size budget would require a separately reviewed baseline/allowlist so that a
mechanical limit does not block legitimate correction evidence or permit a
large file merely because another file was removed.

## Why Git LFS is not enabled in this branch

Git LFS is not installed in the controller environment, the workflows do not
request LFS objects during checkout, and the existing binaries are already
ordinary Git objects. Adding an LFS pattern now would create a mixed repository:
existing files would remain normal blobs while a later edit could require a
filter driver that developers and CI do not yet have. Migrating the existing
objects would rewrite branch history, which is outside the release boundary.

Git LFS can be evaluated without introducing another vendor because the Git
remote is already hosted on GitHub, but adoption still requires an explicit
account quota and billing decision. It also requires proof that all release,
preview, validator, and local-review environments fetch LFS objects before they
run checksum validation. Those prerequisites have not been established, so LFS
is not a safe policy-only change.

## Required sequential decision after this release

1. Choose the long-term evidence store: GitHub LFS on the existing remote, the
   existing private application storage with immutable checksums, or continued
   ordinary Git storage with an approved size budget.
2. If choosing GitHub LFS, confirm account storage/bandwidth limits and whether
   any paid capacity is authorized; install and pin Git LFS for developer and CI
   environments; enable LFS checkout in every workflow; then prove a clean clone
   can run all artwork and manifest validators offline from the working tree.
3. If choosing private application storage, change the artwork validator and
   ledger contract to fetch checksum-addressed provenance into an isolated
   cache, prove authorization and retention, and keep only compact ledger and
   approval evidence in Git.
4. Perform any object migration in a dedicated maintenance window with a tag,
   rollback clone, contributor coordination, and full history/clone/CI
   verification. Do not mix that migration with course publication.

Until that decision is made and verified, the current release assets remain in
place and new nonessential binary lineage is blocked by review policy.
