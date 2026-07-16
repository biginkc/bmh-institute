# Policy-safe held-video recut packages

These packages prepare replacement narration for the three held cuts whose
verbatim transcripts exposed fixed compensation, activity, or advancement
claims. They do not render or generate video, generate captions, call a
provider, change a manifest status, upload an asset, or approve a cut.

Each JSON file is the source of truth for one recut. It locks the exact held
source SHA-256, review transcript and VTT checksums, current manifest objective,
actual next course sequence, scene narration, and a contiguous timecoded edit
map covering every spoken moment in the held cut.

Generated reviewer artifacts live under `generated/`:

- `video-slot-17-compensation-script.txt` and its edit specification
- `video-slot-18-operator-script.txt` and its edit specification
- `video-slot-19-career-script.txt` and its edit specification

The scripts are role-agnostic. They contain no dollar figures, call quotas,
fixed promotion timelines, pay formulas, or advancement promises. They point
learners to the current offer letter, written plan, role sheet, SOP, and manager
where each source is relevant. The spoken transitions match the current course
manifest rather than an assumed sequence.

Rebuild and validate the human-readable files:

```sh
node scripts/course-content/build-held-video-recut-docs.mjs --write
node scripts/course-content/validate-held-video-recuts.mjs
node --test content/course-manifests/held-video-recuts.qa.test.mjs
```

`recut-policy.json` is the machine-readable claim policy. Validation scans only
`scenes[].spoken_text`; source-problem summaries intentionally name the claims
being removed. The validator also proves that the source evidence still matches
its checksum, timecode coverage is gap-free, every scene is mapped, generated
documents are current, and all production permissions remain false.

The nine-cut approval ledger is
`../held-video-review/approvals.json`. Six corrected candidates remain pending.
The three policy-defective source hashes are terminally marked
`changes_requested` and cannot be approved. A reviewer must key every decision
to both `source_key` and SHA-256 and provide approver, date, and notes. A revised
cut receives a new pending checksum-keyed candidate rather than rewriting
review history.
