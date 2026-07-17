# BMH artwork pose variation contract

Status: production plan only. No image in this contract is approved, promoted, uploaded, or published.

The machine-readable source is `scripts/course-content/artwork-pose-contract.mjs`. It covers the course cover, all 19 lesson masters, the distinct Fact Find master, all 19 lesson-card outputs, and all 29 video-poster outputs.

## Locked character rules

- Every artwork output contains exactly one person.
- The person is Andrea or the recurring curly-haired seller, never both.
- Skin fill is pure white in every pose.
- Face, hair, proportions, clothing language, and line weight stay consistent with the approved identity root.
- Identity consistency does not mean pose consistency. Posture, viewing angle, gesture, prop, and placement must vary.
- Blue and yellow backgrounds are both required across the production set.
- Lesson content and the exact mapped video title determine the gesture, prop, and supporting stickers.
- No independently generated master may reuse another master's full pose signature.
- No posture category may appear on more than four independently generated masters.

## Independent master plan

| Master | Character | Posture and action | Placement | Background |
| --- | --- | --- | --- | --- |
| Course cover | Andrea | Walking toward the training doorway with a learner guide | Lower left moving center | Blue |
| Welcome and Mindset | Andrea | Standing front and centered with relaxed arms | Center beneath doorway | Blue |
| Real Estate Terms Glossary | Seller | Seated at a desk reading an open reference book | Right center | Yellow |
| Tech Stack and Systems | Andrea | Perched on a stool reaching toward the tool hub | Lower left | Blue |
| Humanizing the Lead | Seller | Half turned with one hand over his heart | Left beside house | Yellow |
| The BMH Offer Playbook | Seller | Seated at a table comparing two option cards | Center left | Blue |
| Sales Pipeline and Stage Ownership | Andrea | Walking with a handoff baton | Lower center | Yellow |
| Opening the Call | Andrea | Seated behind a desk with headset, left hand open | Lower center | Blue |
| Discovery and Handoff | Andrea | Standing side-on and presenting a context folder | Right center | Blue |
| Objection Architecture | Seller | Standing three-quarter with left hand open | Lower left | Yellow |
| Objection Scripts Playbook | Andrea | Half turned and selecting a response card | Center right | Blue |
| Complex Objections | Seller | Leaning forward to loosen the objection knot | Left center | Yellow |
| Seller FAQ Decoder | Seller | Seated at a desk with a question card | Lower center | Blue |
| Follow-Up Cadence | Seller | Perched on a stool and pausing with a phone | Right | Yellow |
| Conversation Flow Mastery | Andrea | Walking along the conversation path | Center right moving left | Blue |
| Closing and Deal Engineering | Seller | Seated at a table reviewing the agreement | Lower right | Yellow |
| KPIs and Sales Telemetry | Andrea | Standing and pointing to a quality signal | Right center | Blue |
| Compensation Engine | Andrea | Seated at a desk reviewing the current role sheet | Left center | Yellow |
| Operator Playbook and Daily Mission Control | Andrea | Half turned toward the mission-control board | Lower left | Blue |
| Career Growth Path | Andrea | Walking up broad growth steps | Center moving up right | Yellow |
| The Fact Find poster master | Andrea | Leaning forward to listen while taking a short note | Left center | Yellow |

## Output inheritance

The 19 lesson cards inherit their lesson master's exact character and pose. Twenty-eight video posters inherit the pose of their mapped lesson master. The Fact Find poster uses its own independent Andrea master so it does not reuse the seated Opening the Call stance.

Poster derivation does not count as a new pose. The artwork workflow records the source master on every output and rejects any derived output whose character or pose metadata drifts from that source. Each poster still records its exact mapped video title as the visual cue for crop and subject review.

## V8 pilot bindings

The pilot lineage uses three globally unique labels and signatures:

| Pilot | Label | Signature |
| --- | --- | --- |
| Orientation | `standing-welcome` | `standing-front-centered-arms-relaxed-beneath-doorway-cue` |
| Opening the Call | `seated-desk-call` | `seated-three-quarter-behind-desk-left-hand-open-right-hand-at-headset` |
| Objection Architecture | `standing-reframe-gesture` | `standing-three-quarter-left-hand-open-right-arm-relaxed` |

V8 rejects the prior identical-pixel Andrea stance lock. It keeps the same approved Andrea identity root while requiring Orientation and Opening the Call to have different pose signatures.

## Approval boundary

The three-image pilot still requires Jarrad's explicit approval before any post-pilot image generation. This contract changes prompt and workflow requirements only. It does not authorize generation, approval, manifest promotion, upload, publication, or learner access.
