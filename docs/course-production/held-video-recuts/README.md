# Policy-safe held-video recut packages

These packages prepare replacement narration for seven held cuts whose source
evidence exposed role titles, fixed progression, direct guarantees, fixed
compensation, activity, or advancement claims. They do not render or generate video, generate captions, call a
provider, change a manifest status, upload an asset, or approve a cut.

Each JSON file is the source of truth for one recut. It locks the exact held
source SHA-256, checksum-verified source evidence, current manifest objective,
actual next course sequence, exact forbidden-language removals, scene
narration, shot plan, and a contiguous timecoded edit map covering every
spoken moment in the held cut.

Generated reviewer artifacts live under `generated/`:

- seven `*-script.txt` files and seven edit specifications
- seven deterministic `*-script.docx` team-reference copies plus
  `team-reference-docx.json`, which locks their paths, sizes, and checksums
- seven `*-heygen-draft.json` files containing the canonical offline Studio
  scene payloads, without credentials or permission to call the provider
- seven `*-studio-import.txt` files containing narration only, with exactly one
  nonblank line per canonical Studio scene and no labels or editor instructions
- seven checksum-bound `*-studio-import.json` sidecars plus
  `studio-import-inventory.json`, which preserve line order, scene IDs, input
  indices, response adjacency, and the pause required after every line

Our manual Studio preparation contract maps each nonblank TXT line to one
canonical scene and caps each line at 1,000 characters. The clean TXT files
contain only words Andrea should speak. Standard two-second scene pauses and
the three-second Objection learner gaps live only in the JSON sidecars so they
cannot be narrated by mistake.

The Objection Scripts payload deliberately separates every seller pushback
from Andrea's response. Each pushback scene records a three-second learner
think gap at its ending boundary, and the response is the immediately following
Andrea-spoken scene. This produces 68 canonical inputs. HeyGen documents a
50-input limit for one Studio v2 request, so the payload marks the sequence as
requiring provider preparation in Studio and forbids collapsing the scenes to
bypass the gaps. The clean import and sidecar support manual Studio preparation;
neither is a one-shot executable API request.

The seven spoken scripts passed the BMH `humanizer` review on 2026-07-18. The
offline draft artifacts lock the existing Sandra/Andrea avatar, Hope voice,
Drafts folder, scene order, and 1920x1080 canvas. They deliberately keep
`provider_call_allowed`, `render_allowed`, and Codex's Generate permission
false. Building or validating these JSON files does not contact HeyGen.

The scripts are role-agnostic and provider neutral. They contain no dollar
figures, call quotas, fixed progressions, direct outcome guarantees, pay
formulas, or advancement promises. They point
learners to the current offer letter, written plan, role sheet, SOP, and manager
where each source is relevant. The spoken transitions match the current course
manifest rather than an assumed sequence.

Rebuild and validate the human-readable files:

```sh
node scripts/course-content/build-held-video-recut-docs.mjs --write
node scripts/course-content/validate-held-video-recuts.mjs
node --test content/course-manifests/held-video-recuts.qa.test.mjs
```

`recut-policy.json` is the machine-readable claim policy. Spoken-policy
validation scans the derived narration; source-problem summaries intentionally
name the claims being removed. The validator also proves that source evidence
still matches its checksum, timecode coverage is gap-free, every scene is
mapped, clean import lines and sidecars match the canonical provider sequence,
generated documents are current, and all production permissions remain false.

The eleven-record approval ledger is
`../held-video-review/approvals.json`. Both local policy-cut candidates are now
checksum-bound exact-cut approvals; none remains pending.
The nine policy-defective source hashes are terminally marked
`changes_requested` and cannot be approved. A reviewer must key every decision
to both `source_key` and SHA-256 and provide approver, date, and notes. A revised
cut receives a new pending checksum-keyed candidate rather than rewriting
review history.
