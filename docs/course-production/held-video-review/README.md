# Held video review surface

This is a local, read-only review surface for the nine exact cuts still on hold.
It does not copy, transcode, upload, publish, caption, or approve them.

From the BMH Institute integration checkout:

```sh
node scripts/course-content/verify-held-video-review.mjs --serve
```

Open the loopback URL printed by the command. The server hashes all nine exact
videos plus the six review-only evidence files before it listens. The page
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

The verifier fails unless all nine source files match the manifest's byte size
and SHA-256. It also checksum-locks the review-only captions and transcripts for
Compensation Engine, Operator Playbook, and Career Growth Path, and fails if the
checked-in fallback HTML is stale. The other six videos deliberately explain
that learner captions and transcripts remain pending exact-cut approval.

Watch each video in the page. Record any approval separately with the displayed
SHA-256, approval date, and approver. A filename by itself is not an approval.

If the held set intentionally changes, update the manifest and review details,
then regenerate and verify the page:

```sh
node scripts/course-content/verify-held-video-review.mjs --write
node --test content/course-manifests/held-video-review.qa.test.mjs
```
