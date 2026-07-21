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

- one consolidated `held-video-script-review.md` surface and its exact
  checksum-bound `held-video-script-review-request.v1.json`
- the validated manual setup ledger under
  `approvals/held-video-studio-draft-setup.v1.json`, which preserves all seven
  exact Studio draft IDs and links as setup evidence. Script approval is still
  pending: no approval response artifact exists, and setup evidence does not
  authorize manual setup, generation, release, captions, or a status change.
  The canonical browser rollout proves only that 128 of 128 scene selections
  displayed the labels `Doodle Andrea cafe (course)`, `Hope`, and `Avatar IV`.
  It does not prove exact provider IDs, Auto-enhance, pause values, voice speed,
  or any other Studio setting.
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

The seven spoken scripts passed the BMH `humanizer` review on 2026-07-18. In
the offline configuration contract, `b2cd05454d284058ad8d7303545821e6`
identifies the `Doodle Andrea` avatar group, while
`7c00b3e0ad8b4a6a97115243aff056bb` identifies the selected `cafe (course)`
generation look. Those IDs come from the offline contract, not from the
visible-label browser audit. The offline draft artifacts also lock the Hope
voice, Drafts folder, scene order, and 1920x1080 canvas. They deliberately keep
`provider_call_allowed`, `render_allowed`, and Codex's Generate permission
false. Building or validating these JSON files does not contact HeyGen.

The scripts are role-agnostic and provider neutral. They contain no dollar
figures, call quotas, fixed progressions, direct outcome guarantees, pay
formulas, or advancement promises. They point
learners to the current offer letter, written plan, role sheet, SOP, and manager
where each source is relevant. The spoken transitions match the current course
manifest rather than an assumed sequence.

## Post-approval Studio handoff checklist

This checklist applies only after an exact, checksum-bound script approval is
preserved. It does not authorize setup, generation, rendering, or billing.

- Open each existing draft through the BMH Training project
  (`5eb17fe1b67d4de6a010519fd367ca73`). Keep working drafts in Drafts
  (`3d837f4e9fb84b8294785fc060a342c0`) and move an approved final render to
  Final (`a095b4f712264847bf7c7ec358e2c101`).
- Verify every scene uses the selected Doodle Andrea `cafe (course)` look
  (`7c00b3e0ad8b4a6a97115243aff056bb`), Hope
  (`42d00d4aac5441279d8536cd6b52c53c`), Avatar IV (Premium), and
  Auto-enhance on a 1920x1080 canvas.
- Verify the narration and scene order against the clean import plus its
  checksum-bound JSON sidecar. Apply the sidecar pause after every scene:
  two seconds normally and three seconds after each Objection seller prompt.
- Before the Jarrad-only Generate handoff, rename the existing drafts to:
  `Lesson 01 - Welcome - Draft`, `Lesson 01 - Mindset - Draft`,
  `Lesson 10 - Objection Scripts Playbook - Draft`,
  `Lesson 15 - Closing and Deal Engineering - Draft`,
  `Lesson 17 - Compensation Engine - Draft`,
  `Lesson 18 - Operator Playbook - Draft`, and
  `Lesson 19 - Career Growth Path - Draft`.
- Jarrad Henry is the only person who clicks Generate. A rendered cut still
  requires exact-cut review before captions, transcripts, manifest promotion,
  upload, publication, or employee access.

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
`../held-video-review/approvals.json`. Both local policy-cut candidates and
seven directly authorized source cuts are checksum-bound exact-cut approvals;
none remains pending. Two historical source hashes remain terminally marked
`changes_requested`. A reviewer must key every decision
to both `source_key` and SHA-256 and provide approver, date, and notes. A revised
cut receives a new pending checksum-keyed candidate rather than rewriting
review history.
