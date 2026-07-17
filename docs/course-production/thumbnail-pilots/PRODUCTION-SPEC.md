# BMH Institute artwork production specification

Status: blocked pending Jarrad's approval of all three thumbnail pilots.

This specification prepares the post-approval artwork lane. It does not approve
the pilots, generate new images, update manifest approvals, upload files, or
publish course content.

The currently tracked pilot lineage and production inventory remain version 1.
That contract is intentionally compatible and blue-only so the existing
preapproval ledger continues to validate byte-for-byte. Version 2 is activated
only by deliberately replacing the canonical `generation-lineage.json` with a
valid `bmh-thumbnail-pilot-lineage/v2` artifact and rebuilding the inventory.
Candidate or revision files do not activate the migration.

## Locked output inventory

The immutable machine-readable plan is `production-inventory.json`. It is
regenerated from the course manifest and fails if the artwork keys, lesson
order, video order, titles, paths, dimensions, or immutable-storage metadata
have drifted. Mutable production state lives separately in
`production-ledger.json`; rebuilding the plan never erases lineage, reviews,
approvals, or checksums.

| Output class  | Count | Final dimensions |
| ------------- | ----: | ---------------- |
| Course cover  |     1 | 1280 x 800       |
| Lesson cards  |    19 | 1280 x 800       |
| Video posters |    29 | 1280 x 720       |

The 49 final output paths match the current manifest exactly. Every poster has
one video asset key, one poster asset key, one lesson master, one focus subject,
and one derivative recipe. Reusing a poster path or final pixel checksum is a
blocking error.

## Pilot mapping

The review pilots map to the production catalog as follows. Approval of a pilot
authorizes its topic and style for production. It does not approve the final
manifest asset until the promoted derivative passes the same artwork QA as the
rest of the batch.

| Pilot                  | Lesson topic           | Lesson asset key    | First poster asset key                        |
| ---------------------- | ---------------------- | ------------------- | --------------------------------------------- |
| Orientation            | Welcome and Mindset    | `thumbnail-slot-01` | `poster-video-slot-01-welcome`                |
| Opening the Call       | Opening the Call       | `thumbnail-slot-07` | `poster-video-slot-07-opening`                |
| Objection Architecture | Objection Architecture | `thumbnail-slot-09` | `poster-video-slot-09-objection-architecture` |

The Orientation master also supplies a distinct Mindset poster. The Opening the
Call pilot supplies only its lesson card and Opening the Call poster. Fact Find
requires its own post-approval image-generation call, exact prompt, source,
flat master, prompt checksum, and production record; it is not derived from the
Opening pilot. The Objection Architecture lesson has one video and uses the
full safe master for its only poster.

## Generation contract

After explicit pilot approval, use the built-in image generation tool. Make one
distinct generation call for the course cover, one for each of the 16 remaining
lesson masters, and one separate call for the Fact Find poster master. These 18
planned calls have unique identifiers in the inventory. Do not use a single
multi-image call or treat repeated variants as distinct lesson subjects.

Promote each approved pilot from its checksum-locked flat master. Do not call the
model again after the exact pilot bytes receive formal approval. The inventory marks these three records as
`promote-approved-pilot-flat-master` and marks the other 16 lesson records as
`generate-after-pilot-approval`. The retained pilot files are review evidence
outside the 49 manifest output paths.

Lineage version 1 records three independent pilot generation chains. Lineage
version 2 instead permits one checksum-locked shared cast master generated once,
followed by one independently evidenced edit chain per pilot. The shared parent
is provenance, not a fourth approved pilot and not a manifest output. Every edit
must name the shared parent, carry its checksum as `parent_source_sha256`, and
use the exact shared-parent output as its first input. Repeating the shared
generation as if it occurred once per pilot or relabeling an edit as an
independent generation is prohibited.

Each inventory entry contains its exact prompt and prompt SHA-256, reference
input identifiers, planned source path, planned flat-master path, provenance
requirements, and approval record. Fact Find has a `direct_master` record with
its own fields. Keep the following production record for every call:

- Exact prompt text and prompt SHA-256.
- Built-in tool as generator.
- Generation timestamp and operator.
- Generated source path and source SHA-256.
- Every reference path and locked reference SHA-256.
- Correction prompt and parent checksum when a correction is required.
- Flat-master path, dimensions, palette result, and checksum.
- Visual review status, reviewer, timestamp, and evidence path.

All declared references are repo-relative, tracked, and checksum verified by
both the builder and QA test before the inventory is accepted. The three pilot
subject references are portable copies of the exact checksum-locked inputs used
for the pilot calls. The two `docs/design` inputs are style-only references;
non-pilot prompts use them for visual language, not subject matter.

No generated source is approved merely because it exists. The manifest remains
`missing` until the source, flat master, card, and all mapped posters pass QA and
receive the required approval.

## BMH Sticker System rules

Every master uses the same locked rules as the pilots:

- One uniform background explicitly locked per master: cornflower blue RGB
  `103, 182, 255` or golden yellow RGB `255, 211, 1`.
- Thick, slightly wobbly black outlines.
- Rounded imperfect geometry and simple sticker silhouettes.
- Exactly the locked eight-color palette after flattening.
- No title, words, letters, numbers, logos, watermark, gradients, lighting,
  shadows, reflections, texture, depth, realistic perspective, or 3D rendering.
- Meaningful objects stay inside the central 80 percent.
- Every video focus subject is a complete independently recognizable sticker
  cluster in its declared left, center, right, or full safe zone.
- Decorative marks remain limited and must support the lesson subject.

The Compensation Engine prompt intentionally excludes currency, dollar figures,
fixed pay promises, and numeric targets. It depicts the current written role
plan connected to verified work and outcomes.

## Card derivation

Generate a 16:9 lesson master. Preserve the entire master when producing the
16:10 lesson card:

1. Flatten the source to the exact eight-color palette with no dithering.
2. Contain the entire master inside a 1280 x 720 frame with Lanczos resampling.
   Center it and fill any unused horizontal or vertical space with the recipe's
   exact `normalize_background_rgb`; neither axis may exceed the frame.
3. Place it on a 1280 x 800 solid canvas using the recipe's exact
   `padding_color_rgb`.
4. Add 40 pixels of that exact padding color above and below.
5. Do not crop or stretch the master.
6. Save as lossless WebP at the manifest `local_path`.

This matches the accepted pilot derivative method and prevents card crops from
removing a teaching sticker.

## Poster derivation

Each lesson master contains one independently framed anchor for each video in
that lesson. First contain the entire master in a 1280 x 720 frame, centered,
using the derivative recipe's exact `normalize_background_rgb` for unused
space. This normalization never crops the source. The inventory then maps every
video to its named anchor and one exact pixel crop profile:

- `full-safe`: `0, 0, 1280, 720`.
- `left-safe`: `64, 144, 768, 432`.
- `center-safe`: `256, 144, 768, 432`.
- `right-safe`: `448, 144, 768, 432`.

The crop ratios are expressed against a 16:9 source. Equal normalized width and
height therefore retain a 16:9 pixel aspect ratio. Resize the selected window to
1280 x 720 with Lanczos resampling and save as lossless WebP.

Do not move a crop window to make a failed master appear usable. If a named
anchor is clipped, missing, or located in the wrong zone, reject or correct the
master. If a focused poster depicts another video's subject, reject it. If two
posters have the same final pixel SHA-256, reject both until the duplicate is
resolved.

## Version 2 lineage and color contract

The inventory builder accepts canonical pilot lineage versions 1 and 2. It does
not infer version 2 from filenames, candidate ledgers, dates, or image contents.
Version 2 uses this shape (irrelevant fields omitted here only for readability):

```json
{
  "schema_version": "bmh-thumbnail-pilot-lineage/v2",
  "status": "awaiting-jarrad-approval",
  "shared_parents": [
    {
      "id": "andrea-seller-canonical-v5",
      "operation": "generate",
      "prompt_path": "<repo-relative path>",
      "prompt_sha256": "<SHA-256 of prompt text without one trailing newline>",
      "inputs": [
        {
          "id": "andrea-approved",
          "role": "approved cast identity",
          "path": "<repo-relative path>",
          "sha256": "<SHA-256>"
        }
      ],
      "tool_evidence": {
        "thread_id": "<thread id>",
        "agent_path": "<agent path>",
        "invocation_call_id": "<image-generation invocation id>",
        "tool_output_call_id": "<tool result call id>",
        "tool_output_id": "<generated output id>",
        "invoked_at": "<ISO-8601 timestamp>",
        "completed_at": "<ISO-8601 timestamp>"
      },
      "output": {
        "path": "<repo-relative PNG path>",
        "sha256": "<SHA-256>",
        "size_bytes": 1,
        "dimensions": [1672, 941]
      }
    }
  ],
  "records": [
    {
      "slug": "opening-the-call",
      "shared_parent_id": "andrea-seller-canonical-v5",
      "render_contract": {
        "master_background_rgb": [255, 211, 1],
        "lesson_card": {
          "normalize_background_rgb": [255, 211, 1],
          "padding_color_rgb": [255, 211, 1]
        },
        "video_poster": {
          "normalize_background_rgb": [255, 211, 1]
        }
      },
      "terminal_output_sha256": "<pilot source SHA-256>",
      "steps": [
        {
          "step": 1,
          "operation": "edit",
          "parent_source_sha256": "<shared-parent output SHA-256>",
          "prompt_path": "<repo-relative path>",
          "prompt_sha256": "<SHA-256>",
          "inputs": [
            {
              "id": "andrea-seller-canonical-v5",
              "role": "shared generated cast parent",
              "path": "<same shared-parent output path>",
              "sha256": "<same shared-parent output SHA-256>"
            }
          ],
          "tool_evidence": {
            "thread_id": "<thread id>",
            "agent_path": "<agent path>",
            "invocation_call_id": "<image-generation invocation id>",
            "tool_output_call_id": "<tool result call id>",
            "tool_output_id": "<generated output id>",
            "invoked_at": "<ISO-8601 timestamp>",
            "completed_at": "<ISO-8601 timestamp>"
          },
          "output": {
            "path": "<repo-relative PNG path>",
            "sha256": "<SHA-256>",
            "size_bytes": 1,
            "dimensions": [1672, 941]
          }
        }
      ]
    }
  ]
}
```

Version 2 requires all three pilot slugs exactly once and exactly one shared
generated cast parent. Every path must be portable and repo-relative; every
prompt, input, and output is checksum verified. Every first pilot step is an
honest `edit` of its resolved shared parent by id, path, and checksum; later
edits must link to the immediately preceding output. Invocation and tool-output
ids cannot be reused. The terminal output must equal the matching
source record in `checksums.json`.

Each `render_contract` field is mandatory in version 2. Background and padding
values may be only the two locked RGB values above. The builder copies these
values into the master and derivative recipes; it never guesses a background
from pixels. This permits the v5 blue/yellow/blue pilot sequence while keeping
derivatives deterministic and checksum reviewable.

When canonical lineage is version 1, the builder emits the existing
`bmh-artwork-production/v1` inventory without new fields or changed bytes. When
canonical lineage is version 2, it emits `bmh-artwork-production/v2`, includes
the resolved shared parent on each pilot review record, uses the first edit's
exact prompt and input ids for master provenance, and emits explicit background
fields. A version 1 ledger must not be approved against a version 2 inventory.
The preapproval ledger must be deliberately migrated or rebuilt only after the
version 2 sources, flat masters, cards, posters, lineage, and checksums are
stable. The builder never rewrites the ledger itself.

## Approval and provenance fields

Every cover, lesson, card, and poster record has a structured approval object:

```json
{
  "status": "blocked-pending-pilot-approval",
  "approved_by": null,
  "approved_at": null,
  "evidence": null
}
```

Only the three lesson-level pilot records use
`awaiting-jarrad-approval`. Production outputs remain blocked. After Jarrad's
decision, record the pilot decision separately before generating the rest of the
batch. Do not rewrite historical prompt, reference, or checksum fields when an
asset receives approval.

### Pilot approval artifact

Pilot approval requires a structured JSON artifact created from Jarrad Henry's
affirmative response to a checksum-locked review request. The controller must
present the three pilots, record the human response, and preserve both the
request and response. An agent must not manufacture or infer approval from the
fact that the files exist or pass automated QA.

The approval artifact uses this exact schema:

```json
{
  "schema_version": "bmh-artwork-pilot-approval/v1",
  "decision": "approved",
  "approver": "Jarrad Henry",
  "approved_at": "<ISO-8601 UTC timestamp>",
  "request_binding": {
    "request_id": "<unique review request id>",
    "request_path": "<safe repo-relative path>",
    "request_sha256": "<SHA-256 of exact request-file bytes>",
    "pilot_bindings_sha256": "<SHA-256 defined below>"
  },
  "inventory_sha256": "<SHA-256 of exact production-inventory.json bytes>",
  "generation_lineage_sha256": "<SHA-256 of exact generation-lineage.json bytes>",
  "pilot_bindings": [
    {
      "slug": "orientation",
      "terminal_output_sha256": "<generated source SHA-256>",
      "flat_master_sha256": "<flat-master SHA-256>",
      "lesson_card_sha256": "<pilot card SHA-256>",
      "video_poster_sha256": "<pilot poster SHA-256>"
    }
  ]
}
```

`pilot_bindings` must contain exactly `orientation`, `opening-the-call`, and
`objection-architecture` in that order, with the corresponding fields above.
Compute `request_binding.pilot_bindings_sha256` as the SHA-256 of these UTF-8
lines in that exact order, including the final newline:

```text
<slug>|<terminal_output_sha256>|<flat_master_sha256>|<lesson_card_sha256>|<video_poster_sha256>\n
```

Any other decision, approver, timestamp shape, request checksum, inventory
checksum, generation-lineage checksum, pilot set/order, binding checksum, or
pilot checksum fails closed. The CLI can validate this structure and its
repository bindings, but it does not cryptographically establish human
identity. The controller remains responsible for obtaining Jarrad's actual
response and must never substitute an agent-authored artifact for it.

Every planned generated master also has a guarded `production_record`. Before a
source is produced, all evidence fields are null:

```json
{
  "status": "not-produced",
  "generated_at": null,
  "generated_by": null,
  "generation_call_id": null,
  "source_sha256": null,
  "flat_master_sha256": null,
  "review_decision": null,
  "reviewed_at": null,
  "reviewed_by": null,
  "review_evidence": null
}
```

`produced-awaiting-review` requires all generation fields and valid source/flat
SHA-256 values while review fields remain null. `reviewed` additionally requires
an explicit `approved` or `changes_requested` decision, reviewer, review time,
and safe evidence path. Unknown fields, invalid or backward timestamps,
identical source/master hashes, and partial transitions fail validation. The
durable ledger additionally binds every output's encoded checksum, decoded-pixel
checksum, dimensions, derivative recipe, lineage, and review evidence.

## Commands and checks

Regenerate the inventory from the current course manifest:

```bash
node scripts/course-content/build-artwork-production-inventory.mjs
```

Verify that the tracked inventory exactly matches deterministic builder output
without writing any file:

```bash
node scripts/course-content/build-artwork-production-inventory.mjs --check
```

Run the inventory contract tests:

```bash
node --test content/course-manifests/bmh-artwork-production.qa.test.mjs
```

Verify the initialized, still-unapproved durable ledger:

```bash
npm run artwork:production -- init
npm run artwork:production -- status
npm run artwork:production -- verify
npm run test:artwork-production
```

For a version 2 migration, first stage and verify the exact shared parent,
three pilot edit chains, deterministic flat masters, cards, posters, checksums,
and portable references. Then replace the canonical lineage intentionally,
rebuild the inventory, and migrate the still-preapproval ledger using the
workflow's version-aware migration path. Do not run `approve-pilots` while the
inventory and ledger schema versions differ. The existing `init` command's
refusal to overwrite a non-identical ledger is a safety gate, not an error to
bypass by hand-editing mutable production state.

Re-run the builder check, artwork contract tests, and ledger verification after
that migration. Only the exact deterministic v2 cards and posters may appear in
the checksum-bound review request. Approval of earlier unconstrained previews
does not approve the migrated bytes.

After Jarrad explicitly approves all three pilots, record the structured,
checksum-bound approval artifact above and promote the exact pilot bytes before
any new generation:

```bash
npm run artwork:production -- approve-pilots --approved-by "Jarrad Henry" --approved-at <ISO-UTC> --evidence <repo-path>
npm run artwork:production -- promote-pilots
```

The same CLI provides `ingest`, `derive`, `review`, `finalize`, and `reconcile`.
It writes the finalized ledger first and reconciles the manifest second, so a
crash can be recovered with `reconcile`. It never uploads or publishes assets.

Run the existing pilot derivative reproduction and checksum check before pilot
review:

```bash
python3 scripts/course-content/prepare-thumbnail-pilots.py
git diff --exit-code -- \
  course-assets/thumbnails/pilots \
  course-assets/posters/pilots \
  docs/course-production/thumbnail-pilots/checksums.json
```

After production assets exist, final QA must verify:

1. Exactly one cover, 19 cards, and 29 posters exist at inventory output paths.
2. Every card is 1280 x 800 and every poster is 1280 x 720.
3. Every final asset uses only the locked eight-color palette.
4. All 49 output paths and all 29 poster pixel checksums are unique.
5. Each poster visibly matches its inventory `focus_subject` and video title.
6. Every source, prompt checksum, reference, flat master, derivative,
   production record, and approval field has complete provenance.
7. The course manifest is updated only after checksums and approvals are final.

Batch generation remains prohibited until Jarrad explicitly approves the three
pilots.
