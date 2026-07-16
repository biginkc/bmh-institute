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
- 19 required, checksum-addressed accessible learner-guide PDFs
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
held object. Produced captions, transcripts, and guides are also checksum
addressed; remaining Wave 2 derivatives receive immutable paths after their
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
and also references exactly one required learner-guide PDF download. All 19 PDFs
are produced, machine-checked, rendered, visually inspected, and approved. Each
video references its own poster asset rather than reusing a topic thumbnail; the
29 posters remain gated on approval of the three-image visual pilot.

## Asset inventory

The manifest contains 155 assets:

- 29 videos: 20 approved and 9 held
- 29 exact-cut caption assets: 20 approved and 9 missing pending held-cut approval
- 29 exact-cut transcript assets: 20 approved and 9 missing pending held-cut approval
- 20 thumbnail placeholders: one program cover and 19 topic thumbnails
- 29 video-poster placeholders
- 19 approved accessible learner-guide PDFs

There are 67 missing generated assets: 18 held-cut caption/transcript
derivatives, 20 thumbnails, and 29 posters. Together with the nine video holds,
six pending production Closer Lab IDs, and one operating-stack confirmation,
the validator reports 83 publication blockers and zero manifest errors.

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

The Career Growth bank was also replaced in full rather than filtered from its
stale source export. Its 18 role-agnostic questions contain 10 single-choice,
four multi-select, and four true-or-false items. They assess deliberate practice,
feedback, coachability, capability, current role expectations, and the rule that
increased ownership applies only when a manager confirms it in the current
written role plan. The first eight questions deterministically supply the eight
Career Growth flashcards and the accessible guide's retrieval-practice section.
The validator rejects role ladders, promotion or earnings promises, fixed
timelines, first-consideration claims, daily-number expectations, and any
question whose explanation and correct answer are not grounded in the locked
lesson concepts.

KPI questions that relied on numeric target ranges removed from the shipped
lesson were also excluded. The duplicate leaseback question was retained only
in Seller FAQ Decoder. A question claiming a specific credit effect from
bringing a loan current was excluded from the Objection Scripts Playbook.

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

- Jarrad approves the nine held videos in `HELD-VIDEO-REVIEW.md`. The
  Compensation Engine, Operator Playbook, and Career Growth cuts require wording corrections or
  explicit policy decisions before they can be approved.
- Exact-cut captions and transcripts are produced and approved for all 29 videos.
- The course cover and 19 topic thumbnails are produced and approved.
- All 29 dedicated video posters are produced, approved, and mapped one-to-one.
- The 19 approved accessible learner-guide PDFs remain checksum-matched to
  their required download blocks. The in-app text guides remain available as a
  fallback.
- The six Closer Lab scenarios are built, tested, and mapped to production IDs.
- The current operating stack is rechecked immediately before publication.
  The dated machine-readable confirmation in
  `content/course-manifests/bmh-operating-stack-confirmation.v1.json` retains
  DialPad only for employee manual voice and approved text through
  2026-07-23. Sandra's Sendillo provider and Jitter's Telnyx carrier are internal
  implementation boundaries, and Jitter is not employee-ready. The validator
  fails closed on expiry, manifest/media drift, a missing source snapshot, or a
  changed boundary. A future employee cutover to Jitter requires coordinated
  updates to the Tech Stack and Daily Mission Control videos, captions,
  quizzes, flashcards, and confirmation record.

The manifest records all missing derivatives as `approval_status: missing` and
all nine held cuts as `approval_status: hold`. The validator reports these
as publication blockers rather than silently treating the course as ready.

## Verification

Run:

```sh
node scripts/course-content/validate-manifest.mjs content/course-manifests/bmh-employee-training.v1.json
node scripts/course-content/validate-caption-assets.mjs content/course-manifests/bmh-employee-training.v1.json .
node --test content/course-manifests/*.qa.test.mjs
```

The rebuild pipeline verifies exact local video files and computes checksums for
approved cuts before the guide and caption generators add their derivatives.
Do not run the base builder alone against the release manifest because generated
assets are separate deterministic stages. The validator fails on structural drift, wrong counts,
duplicate identifiers, broken answer keys, stale compensation promises,
removed KPI targets, wrong-track assets, or an accidentally published record.
