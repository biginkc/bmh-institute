# BMH Institute Video Zero release

- Goal: replace the released Welcome lesson video and captions with the
  user-approved, audio-corrected Video Zero master.
- Approved master:
  `course-assets/review-lessonA/LESSON-1A-v11-VIDEO-ZERO-FINAL-AUDIO-QC.mp4`
- Master SHA-256:
  `06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b`
- Caption SHA-256:
  `bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939`
- Rollback point before merge: `origin/main` at
  `047b94968ffcda145f8b860c048ac16fa825df79`.

## Acceptance gates

- [x] The approved 318.351-second 1600 x 900 picture is unchanged from v10.
- [x] Only the ending audio from 04:59.000 onward is corrected.
- [x] The corrected ending measures -17.8 LUFS with a -1.5 dB true peak.
- [x] The full master measures -17.7 LUFS.
- [x] Parking-arrival audio is effectively silent.
- [x] Exact transcript includes “Solve the problem, and the profit follows.
  Every time.”
- [x] Captions cover 00:00.000 through 05:18.000 and satisfy caption QA.
- [x] Replacement is fail-closed, checksum-bound, and retains the previous
  production media as rollback evidence.
- [x] Course-content, project, RTL, typecheck, lint, and production build
  verification pass with no new warnings.
- [x] Manual code and release review is clean.
- [ ] Independent Claude review reports high-confidence readiness.
- [x] PR checks pass and the PR is conflict-free.
- [ ] Production migration and media replacement complete.
- [ ] Real Chrome verifies the corrected video and captions on the live lesson.
