# Held video technical and content QA

Updated: 2026-07-17

## Outcome

All six checksum-locked corrected cuts pass independent container, decode,
audio, black-frame, silence, mapping, and sampled visual checks. The verified
loopback review surface still serves every exact original with byte-range
responses and the expected no-store security headers.

The original six should not be approved. Content review found policy
language that the earlier targeted correction reports did not assess. Two
issues were removed locally without changing the teaching content. Terms
Glossary v10 and KPIs and Sales Telemetry v12 are now checksum-locked on the
local review surface as explicitly unapproved candidates. Welcome, Mindset,
Objection Scripts Playbook, and Closing and Deal Engineering have policy-safe
replacement packages ready for provider review but still need new cuts.

No original was modified. No approval, manifest, caption, transcript,
publication, access, provider, or billing action was performed.

## Exact review lock

- Verified surface: `http://127.0.0.1:56593/`
- Verified after candidate integration: `2026-07-17`
- Held-set SHA-256 lock: `560464a4345c0c97525a448115ed7a88e2fc447c7deca8a6cbed87dca586c06d`
- The review lock covers nine original evidence cuts, two local policy-cut
  candidates, twelve review evidence files, the immutable approval ledger,
  and the candidate EDL inventory.
- `node scripts/course-content/verify-held-video-review.mjs` passed.
- `node --test content/course-manifests/held-video-review.qa.test.mjs` passed
  15 of 15 tests.

## Original-cut matrix

| Source key | Exact file | Technical result | Content result | Next action |
|---|---|---|---|---|
| `video-slot-01-welcome` | `course-assets/review-lessonA/LESSON-1A-v7.mp4` | Pass | Hold | Replace role-title wording or record an explicit policy exception |
| `video-slot-01-mindset` | `course-assets/review-lessonB/LESSON-1B-v4.mp4` | Pass | Hold | Replace fixed week-one and week-six wording or record an explicit policy exception |
| `video-slot-02-terms` | `course-assets/review-lessonGLOA/LESSON-GLOA-v9.mp4` | Pass | Hold, locally correctable | Review the new v10 local policy cut |
| `video-slot-10-objection-scripts` | `course-assets/review-lesson7B/LESSON-7B-v5.mp4` | Pass | Hold | Replace direct outcome guarantees or explicitly approve them as authorized scripts |
| `video-slot-15-closing` | `course-assets/review-lesson11A/LESSON-11A-v4.mp4` | Pass | Hold | Replace the role-bound narration and visuals or record an explicit policy exception |
| `video-slot-16-kpis` | `course-assets/review-lesson12A/LESSON-12A-v11.mp4` | Pass | Hold, locally correctable | Review the new v12 local policy cut |

## Technical evidence

Every original is H.264 at 1600 by 900, 30 fps, yuv420p, limited range, with
AAC 48 kHz stereo audio. Every file fully decoded with exit status zero and no
corrupt packet, invalid frame, timestamp, or concealment error.

| Source key | Duration | Audio mean and peak | Black segments at least 0.5 seconds | Silence result |
|---|---:|---|---:|---|
| `video-slot-01-welcome` | 246.186 s | -21.6 dB, -3.9 dB | 0 | One intentional end-card silence, 243.010 to 246.187 |
| `video-slot-01-mindset` | 362.688 s | -21.6 dB, -3.9 dB | 0 | 19 expected beat gaps |
| `video-slot-02-terms` | 451.754 s | -21.2 dB, -4.3 dB | 0 | 22 expected beat gaps including the end tail |
| `video-slot-10-objection-scripts` | 1508.757 s | -24.0 dB, -4.2 dB | 0 | 38 expected drill think-pauses and beat gaps |
| `video-slot-15-closing` | 329.429 s | -21.0 dB, -4.3 dB | 0 | 15 expected beat gaps |
| `video-slot-16-kpis` | 402.154 s | -21.1 dB, -4.3 dB | 0 | 16 expected beat gaps |

The first four originals identify BT.709 matrix color space but omit explicit
transfer and primaries tags. Closing and KPIs carry all three BT.709 tags.
This is a non-blocking metadata inconsistency because all six decode correctly,
but new local candidates carry the complete tags.

Twenty-four-point contact sheets for each exact cut showed no blank frame,
unintended black frame, duplicated character, obvious hand failure, clipped
subject, or obvious render corruption. This sampled visual pass supports but
does not replace Jarrad's full watch-through.

## Source-cut lineage

- Welcome v7 changes only the cash-as-is and send-off beats from the accepted
  v5 or v6 lineage. It restores the missing cash-as-is explanation and
  `Your training starts now.`
- Mindset v4 changes only the opener from v3. The other nineteen beats retain
  their prior source timing.
- Terms v9 descends from v8. It corrects spoken `days on market`, removes the
  stale seller-situations tease, and replaces the outro.
- Objection Scripts v5 restores two seller prompts and the final word, with a
  tail pad added to the existing v3 or v4 production lineage.
- Closing v4 changes only the b06 narration from the accepted v2 lineage. The
  failed v3 wording is not used.
- KPIs v11 changes only the closing beat from v8. The hand-garbled v9 and v10
  takes were discarded before delivery.

These lineage claims agree with the six checksum-locked QC reports served by
the verified review runtime. They are not substitutes for the exact SHA-256
approval records.

## Content findings

### Welcome

- At 00:00 Andrea calls herself a `virtual onboarding specialist`.
- At approximately 02:48 the narration uses `the best closers at BMH Group`.

These are role titles under the BMH script rule. The phrases are embedded in
on-camera narration. Local deletion would make the introduction and principle
sentence grammatically incomplete, so a replacement narration pass is safer.

### Mindset

- Beat `b12_p7` begins at 04:13.233.
- At approximately 04:22.533 and 04:24.193 the script says `week one` and
  `week six` as a fixed seller progression.

The BMH script rule rejects fixed duration language. The two phrases could be
removed mechanically, but the remaining sentence would be awkward. A clean
rewrite is safer than approving a visibly edited sentence.

### Terms Glossary

- Beat `b11_onmarket` begins at 03:13.833.
- At 03:36.612 through 03:38.552 the narration says `and let the acquisition
  manager know`.

`Acquisition manager` is an explicit forbidden role title. The scene is a
mostly static illustration and the sentence has clean word boundaries, so a
local removal is viable.

### Objection Scripts Playbook

The lesson contains several direct promises rather than conditional discovery
language:

- 02:58.833, `If I can guarantee your net...`
- 13:20.833, `you get a clean, certain outcome without games`
- 14:08.100, `your price, timeline, and certainty don't change`
- 23:18.800, `I can bring the loan current, stop the sale...and rebuild your
  credit`
- 24:02.000, `I can close, fund you...`

These phrases are spread across multiple full comeback beats. Removing them
locally would erase taught answers and leave empty drill sequences. They need
policy-safe replacement scripts or an explicit Jarrad decision that these are
authorized seller promises.

### Closing and Deal Engineering

Role-bound narration appears throughout b03, b04, b05, b08, and b10 beginning
at 00:40.000, 00:57.467, 01:23.533, 02:18.600, and 03:00.700. It assigns work
to `the acquisition team`, says the learner is not the person presenting the
offer, and refers to future acquisition responsibilities. The video also
shows shirts labeled `ACQUISITION` and a door labeled `Transaction
Coordinator`.

This is not a surgical-edit case. Removing those beats would remove the lesson
spine. It needs replacement narration and visuals or an explicit role-specific
course exception.

The b06 audio fix itself is valid. The exact v4 audio says `X amount in cash`,
not the broken dollar-X placeholder retained in the stale source-text field.

### KPIs and Sales Telemetry

- Beat `b02_gaps_not_guesses` begins at 00:15.200.
- At 00:27.139 through 00:28.199 the narration says `and earn the most`.

`Earn the most` is an explicit compensation-promise phrase in the locked
recut policy. It occurs over a static line chart and can be removed locally
while preserving the sentence: `The people who improve fastest are the ones
who actually look at their numbers...`

The video contains no fixed numeric dial quota. Its later offer-letter wording
points learners to the current written source rather than promising pay.

## Local correction candidates

### Terms Glossary v10 local policy cut

- File: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lessonGLOA/LESSON-GLOA-v10-LOCAL-POLICY-CUT.mp4`
- SHA-256: `6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769`
- Size: 104,384,792 bytes
- Duration: 449.534 seconds
- Edit decision list: remove source 216.612333 through 218.772333, then use a
  0.06 second video and audio crossfade at the boundary.
- Resulting line: `Don't hang up, but do note it. Sometimes listed properties
  don't sell...`
- Technical result: full decode pass, zero black segments, 22 expected silence
  segments, -21.2 dB mean, -4.3 dB peak, H.264 1600 by 900 yuv420p 30 fps with
  complete BT.709 tags, AAC 48 kHz stereo.
- Dense seam frames show the same stable illustration with no visual pop.
- Human listen-through of the new sentence seam is still required.

### KPIs v12 local policy cut

- File: `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets/review-lesson12A/LESSON-12A-v12-LOCAL-POLICY-CUT.mp4`
- SHA-256: `3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a`
- Size: 53,799,917 bytes
- Duration: 400.994 seconds
- Edit decision list: remove source 27.139 through 28.279, then use a 0.02
  second video and audio crossfade at the boundary.
- Resulting line: `The people who improve fastest are the ones who actually
  look at their numbers...`
- Technical result: full decode pass, zero black segments, 16 expected silence
  segments, -21.1 dB mean, -4.2 dB peak, H.264 1600 by 900 yuv420p 30 fps with
  complete BT.709 tags, AAC 48 kHz stereo.
- Dense seam frames show the same stable line chart with no visual pop.
- Human listen-through of the new sentence seam is still required.

Both candidates are now on the checksum-locked review server. Each has a new
pending checksum-keyed approval record and a locked edit decision list. The
course manifest still identifies the held original v9 and v11 files. If a
candidate is accepted, promote only its exact checksum through the controlled
manifest and derivative workflow. Neither candidate is approved, captioned,
transcribed, or ready for publication.

## Exact approval question

Do you approve the Terms v10 and KPIs v12 local policy-cut candidates and
authorize policy-safe replacement recuts for Welcome, Mindset, Objection
Scripts Playbook, and Closing and Deal Engineering?
