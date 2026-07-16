# Caption and transcript QA

Updated: 2026-07-16

## Outcome

Local transcription produced WebVTT captions and accessible Markdown
transcripts for 21 exact video cuts that remain approved. No paid or remote
transcription provider was used. The generation used the locally cached
`mlx-community/whisper-medium.en-mlx` model on the source files identified by
the manifest.

The Compensation Engine and Career Growth cuts were initially included because
their manifest records were approved. Their verbatim transcripts exposed pay,
promotion, and role-ladder claims that conflict with the locked reusable policy.
Both source videos are now held. Their review-only VTT and transcripts are preserved under
`course-assets/held-caption-review/`. They are not referenced as approved
course assets.

## Generation safeguards

- The generator selects only videos whose manifest status is `approved`.
- Every source file must match its manifest SHA-256 before transcription.
- The six previously held cuts were never processed.
- Rebuilding the manifest refuses to approve a derivative that is absent.
- Rebuilding also refuses to accept caption or transcript files for a held cut.
- Approved storage paths include the full derivative checksum.

## Automated QA

The caption validator proves:

- 21 approved videos have 21 approved VTT files and 21 approved transcripts.
- 8 held videos retain 16 missing derivative records.
- Each VTT starts with `WEBVTT` and contains nonempty timed cues.
- Cue timestamps advance, do not overlap, and do not exceed video duration.
- Each cue uses no more than two lines and no line exceeds 50 characters.
- File size, SHA-256, manifest status, and storage path agree.
- Transcript text is nonempty and uses the correct company name.
- Compensation policy patterns cannot silently enter an approved transcript.

The files preserve source wording. Deterministic cleanup is limited to spacing,
punctuation, and known proper names such as BMH, Sandra CRM, Dialpad,
DealMachine, BatchLeads, and Closer Lab.

## Compensation hold evidence

The Compensation Engine transcript says that compensation uses a ramp-up base, performance
pay, milestone bonuses, commissions on sourced deals, and other outcome-based
pay claims. It later points learners to their offer letter or compensation plan
for exact numbers. The first set of claims is still too specific for the locked
course policy. The video needs a corrected cut or an explicit Jarrad policy
decision before captions can be promoted.

The Career Growth transcript hard-codes a role ladder, a 90-day readiness
window, six-month and one-year promotion examples, higher earning potential,
deal commissions, and management compensation tied to team output. It also
requires a corrected cut or an explicit Jarrad policy decision.

## Verification

Run:

```sh
node scripts/course-content/build-manifest.mjs
node scripts/course-content/validate-caption-assets.mjs content/course-manifests/bmh-employee-training.v1.json .
node scripts/course-content/validate-manifest.mjs content/course-manifests/bmh-employee-training.v1.json
node --test content/course-manifests/approved-video-captions.qa.test.mjs content/course-manifests/bmh-employee-training.qa.test.mjs
```
