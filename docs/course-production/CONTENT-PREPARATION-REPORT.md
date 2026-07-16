# BMH employee training content preparation

Updated: 2026-07-16

## Outcome

The unpublished import draft now contains the full authored course shape:

- 6 sequential sections
- 19 grouped content lessons
- 29 selected video cuts
- 19 required quizzes with 18 curated questions each
- 10 randomized questions per attempt with an 80 percent passing score
- 152 flashcards, 8 per topic
- 6 text assignments with reviewer rubrics
- 6 required Closer Lab scenario specifications
- 19 learner summaries, objective sets, and accessible in-app text guides
- 19 required accessible learner-guide PDF placeholders
- 29 dedicated video-poster placeholders

The machine-readable source is
`content/course-manifests/bmh-employee-training.v1.json`. It remains a draft.
Nothing in this work publishes content or writes to production.

## Canonical sources

- Course wording and order:
  `/Users/jarradhenry/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md`
- Quiz source banks:
  `/Users/jarradhenry/BMH-OS/BMH Training Course/Thinkific/_quiz-exports-by-slot`
- Approved and review video cuts:
  `/Users/jarradhenry/Sites/BMH apps/BMH Institute/course-assets`
- Topic history and supporting-material mapping:
  `/Users/jarradhenry/BMH-OS/BMH Training Course/_course-tracker/modules`

The selection records the approved cut, not the highest-looking filename. It
therefore preserves special choices such as the Lesson 3A revision 1 final,
Lesson 4B approved cut, and Lesson 9A version 1 final.

Every manifest `local_path` is relative to the BMH Institute repository root.
The generator resolves it against
`/Users/jarradhenry/Sites/BMH apps/BMH Institute`, where the ignored
`course-assets` production sources live. Video storage paths include the full
source checksum so a replacement file cannot silently overwrite an approved or
held object. Missing Wave 2 derivatives receive immutable paths after their
files and checksums exist.

## Grouped course map

| Section | Topic | Videos |
|---|---|---|
| Orientation | Welcome and Mindset | Welcome; Mindset |
| Orientation | Real Estate Terms Glossary | Terms Glossary |
| Orientation | Tech Stack and Systems | Tech Stack and Systems |
| Who We Serve | Humanizing the Lead | Humanizing A; Humanizing B; Ideal Seller Profile |
| Who We Serve | The BMH Offer Playbook | Offer Playbook A; Offer Playbook B |
| The Conversation | Sales Pipeline and Stage Ownership | Sales Pipeline; Five-Step Conversation Framework |
| The Conversation | Opening the Call | Opening; Fact Find |
| The Conversation | Discovery and Handoff | Discovery; Handoff |
| Objections and Questions | Objection Architecture | Objection Architecture |
| Objections and Questions | Objection Scripts Playbook | Objection Scripts Playbook |
| Objections and Questions | Complex Objections | Complex Objections; Trust and People Objections |
| Objections and Questions | Seller FAQ Decoder | Questions 1 through 5; Questions 6 through 10 |
| Cadence, Scripts, and Close | Follow-Up Cadence | Follow-Up Cadence |
| Cadence, Scripts, and Close | Conversation Flow Mastery | Conversation Flow Mastery |
| Cadence, Scripts, and Close | Closing and Deal Engineering | Closing and Deal Engineering |
| Performance and Career | KPIs and Sales Telemetry | KPIs and Sales Telemetry |
| Performance and Career | Compensation Engine | Compensation Engine |
| Performance and Career | Operator Playbook and Daily Mission Control | Operator Playbook; Daily Mission Control |
| Performance and Career | Career Growth Path | Career Growth Path |

Every content topic is followed by its own quiz. Each section ends with one
required, reviewed assignment.

Each grouped content lesson keeps its accessible in-app text guide as a fallback
and also references exactly one required learner-guide PDF download. Each video
references its own poster asset rather than reusing a topic thumbnail. These 19
PDFs and 29 posters are intentionally missing until Wave 2 produces and approves
them.

## Asset inventory

The manifest contains 155 assets:

- 29 videos: 21 approved and 8 held
- 29 exact-cut caption assets: 21 approved and 8 missing pending held-cut approval
- 29 exact-cut transcript assets: 21 approved and 8 missing pending held-cut approval
- 20 thumbnail placeholders: one program cover and 19 topic thumbnails
- 29 video-poster placeholders
- 19 accessible learner-guide PDF placeholders

There are 84 missing generated assets. Together with the eight video holds, six
pending Closer Lab IDs, and one operating-stack confirmation, the validator
reports 99 publication blockers and zero manifest errors.

## Quiz curation

The 927 source questions were treated as a candidate inventory, not as an
approved import. The draft selects 342 questions and enforces these rules:

- 18 questions per topic
- 10 questions selected per attempt
- randomized question and answer order
- unlimited attempts with no cooldown
- explanations shown after passing
- exactly one correct answer for single-choice and true-or-false items
- at least two correct answers for multi-select items
- no duplicate normalized question text

The Compensation Engine bank was replaced in full. Its 18 new questions teach
role ownership, current scorecards, the current written agreement, and manager
clarification. They contain no dollar figures, fixed pay terms, or promises.

Career Growth questions about compensation, earnings, and a supposed
commission increase were excluded. KPI questions that relied on numeric target
ranges removed from the shipped lesson were also excluded. The duplicate
leaseback question was retained only in Seller FAQ Decoder. A question claiming
a specific credit effect from bringing a loan current was excluded from the
Objection Scripts Playbook.

The wrong-track `The Cold Call Blueprint.pdf` is not referenced anywhere in the
manifest.

## Assignments

| Section | Assignment | Review focus |
|---|---|---|
| Orientation | Orientation Readiness Check | Systems, service mindset, clarity |
| Who We Serve | Seller and Offer Fit Analysis | Fit analysis, offer framing, respect |
| The Conversation | Conversation and Handoff Plan | Flow, discovery, handoff quality |
| Objections and Questions | Objection Response Plan | Framework, response fit, boundaries |
| Cadence, Scripts, and Close | Follow-Up and Closing Plan | Cadence, compliance, closing readiness |
| Performance and Career | Mission Control and Growth Capstone | Operating discipline, measurement, growth |

All assignments use text submission and require reviewer approval. The rubrics
are included in the manifest even though the current database stores only the
assignment title, instructions, submission type, and review requirement.

## Closer Lab specifications

The manifest includes authored specifications for:

- Guarded inbound seller
- Tired landlord discovery and handoff
- Scam-suspicious pre-foreclosure seller
- Probate follow-up
- Family dynamics seller
- Full-cycle seller conversation

Each specification includes context, learner goal, success criteria, and fail
conditions. Their scenario IDs intentionally start with `pending:`. They cannot
be accepted as production mappings until the corresponding Closer Lab scenarios
exist and their real IDs replace those placeholders.

## Publication gates

The draft must not be published until all of these are resolved:

- Jarrad approves the eight held videos in `HELD-VIDEO-REVIEW.md`. The
  Compensation Engine and Career Growth cuts require wording corrections or
  explicit policy decisions before they can be approved.
- Exact-cut captions and transcripts are produced and approved for all 29 videos.
- The course cover and 19 topic thumbnails are produced and approved.
- All 29 dedicated video posters are produced, approved, and mapped one-to-one.
- All 19 accessible learner-guide PDFs are produced, approved, and mapped to
  their required download blocks. The in-app text guides remain available as a
  fallback.
- The six Closer Lab scenarios are built, tested, and mapped to production IDs.
- The current operating stack is rechecked immediately before publication.
  DialPad remains correct for this draft based on the 2026-07-01 Slot 03 audit
  and the current Jitter access boundary. A future VA cutover to Jitter requires
  coordinated updates to the Tech Stack and Daily Mission Control videos,
  captions, quizzes, and flashcards.

The manifest records all missing derivatives as `approval_status: missing` and
all eight held cuts as `approval_status: hold`. The validator reports these
as publication blockers rather than silently treating the course as ready.

## Verification

Run:

```sh
node scripts/course-content/build-manifest.mjs
node scripts/course-content/validate-manifest.mjs content/course-manifests/bmh-employee-training.v1.json
node --test content/course-manifests/bmh-employee-training.qa.test.mjs
```

The generator verifies the exact local video files and computes checksums for
the approved cuts. The validator fails on structural drift, wrong counts,
duplicate identifiers, broken answer keys, stale compensation promises,
removed KPI targets, wrong-track assets, or an accidentally published record.
