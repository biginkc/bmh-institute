# Caption and transcript QA

Updated: 2026-07-17

## Outcome

Local transcription produced WebVTT captions and accessible Markdown
transcripts for 22 exact video cuts that are approved. No paid or remote
transcription provider was used. The generation used the locally cached
`mlx-community/whisper-medium.en-mlx` model on the source files identified by
the manifest.

The Compensation Engine, Operator Playbook, and Career Growth cuts were initially included because
their manifest records were approved. Their verbatim transcripts exposed pay,
promotion, role-ladder, or fixed dial-quota claims that conflict with the locked reusable policy.
All three source videos are now held. Their review-only VTT and transcripts are preserved under
`course-assets/held-caption-review/`. They are not referenced as approved
course assets.

## Generation safeguards

- The generator selects only videos whose manifest status is `approved`.
- Every source file must match its manifest SHA-256 before transcription.
- No derivative pair is promoted while its exact video cut remains held.
- Existing derivatives cannot be overwritten without the explicit
  `--replace-existing` flag.
- Rebuilding the manifest refuses to approve a derivative that is absent.
- Rebuilding also refuses to accept caption or transcript files for a held cut.
- Approved storage paths include the full derivative checksum.

## Automated QA

The caption validator proves:

- 22 approved videos have 22 approved VTT files and 22 approved transcripts.
- 7 held videos retain 14 missing derivative records.
- Each VTT starts with `WEBVTT` and contains nonempty timed cues.
- Cue timestamps advance, do not overlap, and do not exceed video duration.
- Each cue uses no more than two lines and no line exceeds 50 characters.
- File size, SHA-256, manifest status, and storage path agree.
- Transcript text is nonempty and uses the correct company name.
- Compensation policy patterns cannot silently enter an approved transcript.
- Fixed numeric dial quotas cannot silently enter an approved transcript.
- Caption prose exactly matches its transcript and no cue begins with detached
  punctuation.

The files preserve source wording. Deterministic cleanup is limited to spacing,
punctuation, and known proper names such as BMH, Sandra CRM, Dialpad,
DealMachine, BatchLeads, and Closer Lab.

The adversarial review also compared known ASR trouble spots to the exact local
audio-generation scripts. `gen_audio_5B.py` confirms “quick picture,” “more
than you probably think,” “Your energy,” and “one weak response.”
`gen_audio_18A.py` confirms “liens” and “110 to 150.” Those corrections change
only transcription mistakes; they do not rewrite the spoken policy or meaning.

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

The Operator Playbook transcript hard-codes blocks of 60 to 80, 150 to 200,
and 150-plus dials, as well as a dial target. That conflicts with the locked
course rule against fixed KPI dial targets. The exact cut and its review-only
VTT/transcript remain preserved under `course-assets/held-caption-review/`.

## Verification

Run:

```sh
node scripts/course-content/build-manifest.mjs
node scripts/course-content/validate-caption-assets.mjs content/course-manifests/bmh-employee-training.v1.json .
node scripts/course-content/validate-manifest.mjs content/course-manifests/bmh-employee-training.v1.json
node --test content/course-manifests/approved-video-captions.qa.test.mjs content/course-manifests/bmh-employee-training.qa.test.mjs
```
