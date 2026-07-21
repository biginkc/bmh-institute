# Held video review surface

This is a local, read-only review surface for nine exact source-evidence cuts
and two exact local policy-cut candidates.
It does not copy, transcode, upload, publish, caption, or approve them.

From the BMH Institute integration checkout:

```sh
node scripts/course-content/verify-held-video-review.mjs --serve
```

Open the loopback URL printed by the command. The server hashes all eleven
exact videos plus the twelve review-only evidence files and candidate inventory
before it listens. The page
displays the verification time and a SHA-256 lock for the complete file set.
Every response is `no-store`, and only the verified videos, evidence, and page
have routes. If any locked file's device, inode, size, modification time, or
change time moves after verification, the server refuses the request and stops.

The canonical checkout remains the default media root:

```text
/Users/jarradhenry/Sites/BMH apps/BMH Institute
```

For another checkout, pass an explicit root or set the environment fallback:

```sh
node scripts/course-content/verify-held-video-review.mjs --serve \
  --media-root "/absolute/path/to/BMH Institute"

BMH_HELD_VIDEO_MEDIA_ROOT="/absolute/path/to/BMH Institute" \
  node scripts/course-content/verify-held-video-review.mjs --serve
```

Manifest paths must remain beneath that root. Absolute paths, `..` traversal,
and symlinks that resolve outside the root fail closed. The server binds only to
loopback; its optional `--host` value may only be `127.0.0.1`, `::1`, or
`localhost`. Use `--port 0` (the default) for an available random port.

The checked-in `index.html` is an explicitly **unverified** fallback. It exists
so the inventory can be inspected in source control, but it must not be used to
approve a cut. The verified local-server page is the review surface.

The verifier fails unless all nine source files and both candidate files match
their byte sizes and SHA-256 values. It also checksum-locks the review-only captions and transcripts for
Compensation Engine, Operator Playbook, and Career Growth Path, and fails if the
checked-in fallback HTML is stale. The page distinguishes nine approved exact
cuts from the two remaining policy-defective source-evidence cuts without
changing any decision.

Nine exact cuts are approved: Terms Glossary v10, KPIs v12, and the seven
source cuts directly approved by Jarrad Henry on 2026-07-21. No corrected
candidate remains marked `JARRAD REVIEW REQUIRED`. Any future replacement must
receive a new checksum-keyed record with the displayed SHA-256, approval date,
and approver; a filename by itself is not an approval. Two historical source
records remain `changes_requested` and are marked `REPLACEMENT REQUIRED`; the
seven other original cards are approved only for their exact hashes. Use the
linked `approvals.json` ledger. The verifier
locks and serves this file with the review surface, and stops if it changes
while the server is running. The transition validator requires approver, date,
decision, and notes, preserves terminal history, and permits a replacement only
as a new pending checksum-keyed candidate.

Validate a proposed ledger change before replacing the current ledger:

```sh
node scripts/course-content/validate-held-video-approval-transition.mjs \
  path/to/current-approvals.json \
  path/to/proposed-approvals.json \
  content/course-manifests/bmh-employee-training.v1.json \
  path/to/proposed-local-policy-candidates.json
```

The final argument is optional only when the proposed candidate inventory is
already stored beside the proposed ledger. The command validates that inventory
before it derives the allowed review assets; an arbitrary source key or checksum
cannot widen the approval boundary.

## After a corrected cut is approved

Approval is keyed to the exact checksum; it does not silently promote the
manifest or manufacture learner derivatives. Process each approved candidate
through this controlled sequence:

1. Validate the proposed checksum-keyed ledger transition with the command
   above. The approver must be `Jarrad Henry`, with a date and decision notes.
2. Promote only that exact video checksum from `hold` to `approved` in the
   manifest builder source, then rebuild the manifest. Do not reuse an approval
   for a different file or checksum.
3. Generate captions and an internal review transcript for the newly approved exact cut:

   ```sh
   python3 scripts/course-content/generate-approved-captions.py \
     --manifest content/course-manifests/bmh-employee-training.v1.json
   ```

   The generator checksum-verifies every source and skips every video that is
   still held. Existing approved derivatives remain unchanged on an idempotent
   rerun.
4. Review and correct the new VTT timing, names, terminology, and policy
   wording against the exact approved cut. Record the final derivative paths,
   checksums, sizes, and approval statuses in the manifest builder source, then
   rebuild again.
5. Rebuild and verify this review surface and the caption inventory:

   ```sh
   node scripts/course-content/verify-held-video-review.mjs --write
   node scripts/course-content/verify-held-video-review.mjs
   node scripts/course-content/validate-caption-assets.mjs \
     content/course-manifests/bmh-employee-training.v1.json
   node --test content/course-manifests/held-video-review.qa.test.mjs
   ```

Do not treat the ledger decision alone as course-ready. The video remains a
publication blocker until its exact learner captions are reviewed,
checksum-recorded, and approved. Review transcripts remain internal evidence
and are not learner-facing manifest assets.

Policy-safe replacement scripts, shot plans, forbidden-language maps, and
timecoded edit maps for seven full recuts are documented in
`../held-video-recuts/README.md`. They are preparation artifacts only; they do
not replace the seven directly approved exact cuts or approve a future
replacement checksum.

If the held set intentionally changes, update the manifest and review details,
then regenerate and verify the page:

```sh
node scripts/course-content/verify-held-video-review.mjs --write
node --test content/course-manifests/held-video-review.qa.test.mjs
```
