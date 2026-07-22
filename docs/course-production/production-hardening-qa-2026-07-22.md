# BMH Institute production hardening QA

Date: 2026-07-22  
Production surface: `https://institute.bmhgroupkc.com`  
Change branch: `codex/institute-production-hardening-20260722`  
Verified code head: `34cb74b9c09cc354bca230a0690111010fb534d2`
Pull request: `https://github.com/biginkc/bmh-institute/pull/119`
Status: production walkthrough complete; fixes verified on preview; production release not yet approved

## Acceptance position

The complete learner course was exercised in production with one prefixed,
disposable Hugo identity. The corrective branch was then replayed on a Vercel
preview backed by the dedicated test Supabase project. The disposable identity
and all of its Institute and Sandra records were removed after the run.

This document does not claim that the corrective branch is live. Production
remains on the pre-hardening build until the two release gates at the end of
this document are resolved and the normal review and deployment gates pass.

## Coverage completed

### Course and learner journey

- Completed all 25 learner-facing lessons and all 44 managed lesson-completion
  records in production.
- Exercised locked, unlocked, in-progress, completed, revised, approved,
  suspended, and full-program-complete states.
- Submitted the assignment, received a revision, verified the reviewer note,
  resubmitted, and approved it.
- Submitted and approved the capstone.
- Issued and rendered the final program certificate.
- Confirmed the completion delivery to Sandra was acknowledged on its first
  attempt.
- Confirmed a learner cannot reach admin routes, an owner can reach every admin
  route, and a suspended learner is signed out and denied access.

### Video, audio, captions, and transcripts

- Downloaded and decoded all 29 production lesson videos.
- Reviewed 10,432.603 seconds of media, or 2:53:52.603 in total.
- Transcribed every video from the actual audio with Whisper
  `large-v3-turbo`, producing 2,015 timestamped speech segments.
- Compared the spoken transcript with the lesson title, authored captions,
  neighboring passages, quiz subject matter, silence regions, and suspicious
  repeated runs.
- Sampled frames throughout every video with contact sheets and inspected
  targeted frames around every detected media anomaly.
- Verified all videos decode as H.264 at 1600x900 and 30 fps with AAC, 48 kHz,
  stereo audio.
- Found no black-frame events, decode failures, clipping, or material loudness
  jumps. Integrated loudness stayed between -17.7 and -16.9 LUFS; true peak
  stayed between -4.4 and -3.9 dBFS.
- Replayed signed production media through the learner player and confirmed
  captions load from their signed URL.

Transcription was used as a detector, not as the final authority. Candidate
problems were confirmed against the audio waveform, video frames, captions,
and surrounding lesson meaning before they were classified.

### Guides

- Downloaded and parsed all 19 learner guides.
- Rendered and visually inspected all 38 PDF pages.
- Confirmed every guide is readable, correctly associated with its lesson, and
  free of missing-page or render failures.

### Quizzes

- Exercised all 19 quizzes and all 920 released questions in production.
- Submitted an intentionally wrong path and the canonical correct path for
  every question, producing 1,840 question-result observations.
- Confirmed every quiz can score both 0% and 100%.
- Confirmed the 80% pass rule, unlimited retakes, post-pass explanations,
  progress persistence, completion unlocking, and final-course completion.
- Confirmed answer-option order varied across attempts for 197 of 202 questions
  in the five largest late-course quizzes. The remaining five observations
  were not treated as failures because random ordering can repeat.
- Re-ran the released-quiz revision rehearsal against the dedicated test
  project and confirmed released attempts remain reconcilable.

### Application and administrative surfaces

- Replayed dashboard, course, lesson, certificate, profile, admin overview,
  program, course, user, submission, report, and role-group routes.
- Exercised desktop and 390-pixel mobile widths.
- Confirmed the preview has no global horizontal overflow and no browser console
  errors on the replayed routes.
- Reduced the production-sized admin report computation from about 24 seconds
  to about 3 seconds and the rendered preview route from about 30 seconds to
  about 5 seconds by batching the report workload with bounded concurrency.
- Ran the full seeded browser suite against `bmh-institute-test`: 11 passed and
  one cross-app role-play case was intentionally skipped because Closer Lab
  credentials were not present. Fixture cleanup passed.

## Defects corrected on the branch

1. Replaced corrupted and repeated Objection Scripts captions with a
   timestamped caption file rebuilt from the actual audio and bound its approval
   to the current video checksum.
2. Restored 13.120 seconds of missing spoken captions in Humanizing Sellers,
   Part B.
3. Restored 24.846 seconds of missing spoken captions in Conversation Flow.
4. Corrected the manifest builder so an approved caption-only accessibility
   correction is not rejected by a stale internal transcript artifact.
5. Added anonymous cross-origin media loading so signed caption tracks can load
   reliably.
6. Prevented signed-URL token rotation from replacing an actively playing media
   element.
7. Added explicit recovery for expired or reset signed media and restored the
   latest saved position after an unexpected reset.
8. Restored a learner's prior text, URL, or retained file when an assignment is
   returned for revision.
9. Kept assignment validation and network errors visible beside the form.
10. Wrapped long certificate recipient names instead of clipping the
    certificate body.
11. Sanitized stored certificate HTML again at render time.
12. Contained dense admin tables on mobile and removed page-wide horizontal
    overflow.
13. Reduced admin-report latency with bounded, fail-closed RPC concurrency.
14. Increased lesson back-link touch targets for mobile accessibility.
15. Added baseline browser security headers, narrowed production server-action
    origins, removed the framework disclosure header, and migrated the request
    boundary to the supported Next.js proxy convention.
16. Updated patched dependencies and confirmed `npm audit` reports zero known
    vulnerabilities.
17. Excluded internal QA artifacts from Vercel upload; the preview deployment
    payload fell from roughly 220 MB to 8.6 MB.
18. Separated historical artwork verification from artwork regeneration after
    the patched image-runtime upgrade. Existing approved bytes remain bound to
    their original runtime and exact checksums; any attempt to derive new bytes
    under a different runtime still fails closed.

## Corrective-branch verification

- Unit and server tests: 176 files, 1,033 tests passed.
- Component tests: 39 files, 141 tests passed.
- Course-content tests: 183 tests passed; all 19 guides rebuilt
  deterministically.
- Artwork production workflow: 53 tests passed, including historical runtime
  trust, exact-byte provenance, interrupted promotion recovery, and approval
  forgery rejection.
- Production public-auth smoke: 6 passed; 10 authenticated cases correctly
  skipped without a retained real-Hugo storage state.
- Production build: passed.
- Type generation and type checking: passed.
- Lint and formatting checks: passed.
- `npm audit`: zero known vulnerabilities.
- Vercel preview deployment: Ready.
- Exact-head GitHub verification: passed on commit `34cb74b`, including the
  seeded browser suite (11 passed, one intentional Closer Lab credential skip)
  and successful fixture cleanup.
- Database migrations: validated successfully on PostgreSQL 15, 16, and 17.
- Authenticated preview route replay: passed through a test-project canary
  session, including mobile overflow, assignment revision, signed video,
  signed captions, and long certificate-name fixtures. Every fixture was
  removed after verification.

## Disposable production cleanup

The exact prefixed learner fixture was removed from Hugo and Institute. All
matching profiles, submissions, quiz attempts, completions, media progress,
completion history, certificates, course resume state, role-group membership,
delivery state, and audit events were verified at zero. The one matching Sandra
course outcome and its idempotency record were also removed and verified at
zero.

The cleanup exposed a separate operating-policy gap: append-only video history
blocks ordinary hard deletion of a learner account. Suspension is proven and
works. Before real learners need deletion, BMH should choose and implement an
audited retention/deletion policy rather than relying on direct database work.

## Release gates still open

### 1. Seller FAQ Decoder Part B visual repair

The production video has an unstable, malformed lower-third around 01:12 to
01:18. A video-only repair candidate exists, and its audio bitstream is
identical to production, but the candidate has not been approved, uploaded, or
referenced by the manifest. The checksum-keyed review packet is in
`docs/course-production/faq-b-visual-repair/`.

Required decision: approve or reject the exact candidate checksum. Approval
must be followed by a new video decision, caption validation against the new
video checksum, manifest rebuild, preview playback, and production release.

### 2. Real Hugo login on previews

Production Hugo login works. The dedicated Institute test Supabase project has
no `custom:hugo` provider, so a preview cannot currently complete the real Hugo
redirect and callback. The secure fix is a dedicated non-production OAuth
client and test provider, not reuse or rotation of the production client
secret. The setup contract is recorded in `docs/test-environment-setup.md`.

Required action: register the test OAuth client, add its client ID to Hugo's
first-party allowlist in a controlled Hugo release, configure the test provider,
and prove the full preview authorization callback.

## Additional hardening to schedule before or during VA onboarding

- Decide the learner data-retention and hard-deletion policy exposed by the
  append-only history constraint.
- Add a second-browser and second-device resume test for a partially watched
  video and an in-progress quiz.
- Add slow-network, offline/reconnect, and signed-URL-expiry tests using network
  shaping rather than only normal broadband.
- Add keyboard-only and screen-reader acceptance for the lesson player, quiz,
  assignment, certificate, and mobile navigation.
- Add Safari and iPhone playback acceptance, including backgrounding and audio
  interruption, because browser media behavior differs from Chromium.
- Add an admin operating drill for learner provisioning, revision review,
  suspension, reactivation, certificate lookup, report export, and recovery
  from an accidental role change.
- Add an alert for sustained Sandra delivery failures and a documented replay
  drill.
- Establish a repeatable transcript-to-caption coverage threshold so later
  video replacements cannot silently reintroduce missing spoken passages.
- Refresh the GitHub Actions runtime declarations and Python cache inputs. The
  current exact-head checks pass, but GitHub warns that older JavaScript action
  runtimes are being forced to Node 24 and that the Python cache has no tracked
  dependency file to invalidate it.
