# Held video review surface

This page is a local, read-only review surface for the nine exact cuts still on
hold. It reads the large video files from the canonical checkout and does not
copy, transcode, upload, publish, or approve them.

From the BMH Institute integration checkout:

```sh
node scripts/course-content/verify-held-video-review.mjs
open docs/course-production/held-video-review/index.html
```

The verifier fails unless all nine canonical source files still match the
manifest's size and SHA-256. It also checksum-locks the review-only captions and
transcripts for Compensation Engine, Operator Playbook, and Career Growth Path,
and fails if the checked-in HTML is stale.

Watch each video in the page. Record any approval separately with the displayed
SHA-256, approval date, and approver. A filename by itself is not an approval.

If the held set intentionally changes, update the manifest and review details,
then regenerate and verify the page:

```sh
node scripts/course-content/verify-held-video-review.mjs --write
node --test content/course-manifests/held-video-review.qa.test.mjs
```
