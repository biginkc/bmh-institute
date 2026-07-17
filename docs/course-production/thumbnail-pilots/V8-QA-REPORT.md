# V8 thumbnail pilot QA

Status: **automated QA pending completion; Jarrad approval not granted**.

## Review set

| Pilot | Character | Pose | Background |
| --- | --- | --- | --- |
| Orientation | Andrea | Standing, front-facing welcome | Cornflower blue |
| Opening the Call | Andrea | Three-quarter seated desk call | Cornflower blue |
| Objection Architecture | Recurring seller | Three-quarter standing reframe gesture | Golden yellow |

Each card depicts exactly one person. Andrea and the seller are never shown
together. The three pose signatures are distinct, and the two Andrea cards do
not reuse an identical character pixel layer or stance.

## Video and identity evidence

- Each pilot remains bound to its checksum-locked lesson-video contact sheet.
- Andrea uses the approved Andrea identity root; Objection Architecture uses the
  approved recurring-seller identity root.
- Faces and hands use the required pure-white fill after deterministic palette
  flattening.
- The Opening source is an `image_gen` edit of the previous Opening candidate,
  with its exact prompt, parent, output ID, and source checksum recorded in
  `v8-generation-lineage.json`.

## Deterministic normalization

- Orientation reuses the still-unapproved V7 source candidate and is re-derived into
  V8 paths.
- Opening clears the exterior field and erodes one source pixel of black contour
  using deterministic eight-neighbor majority-color replacement because the
  generated edit had a heavier pen than the reference set.
- Objection Architecture clears the exterior field and retains its deterministic
  one-pixel contour normalization.
- All review cards are 1280x800 lossless WebP; posters are 1280x720 lossless
  WebP; masters and outputs use only the locked eight-color palette.

The current 16:10 exact-black run medians are 4 pixels for Orientation, 3 pixels
for Opening, and 4 pixels for Objection Architecture. Visual inspection is still
required because this numeric check cannot decide whether facial details or
character proportions feel on-brand.

## Gate

No V8 file is approved, uploaded, published, or eligible for batch artwork
generation until Jarrad explicitly approves all three exact lesson-card bytes.
Any derivative change invalidates the recorded checksum and requires another
review.
