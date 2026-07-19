# Held videos

Updated: 2026-07-17

## Review rule

Both exact corrected local-policy cuts, Terms v10 and KPIs v12, have explicit
checksum-bound Jarrad approval in the inspected records. No approvable corrected
candidate remains on this review surface. Seven held source cuts require new
policy-safe replacement videos and are terminally marked `changes_requested`.
They remain source evidence and cannot be approved. Each replacement must
receive a new checksum-keyed ledger record.

The review surface preserves both approved local-policy cuts and the seven
replacement-required sources. All nine use H264 video at 1600 by 900 in yuv420p plus AAC
48 kHz stereo audio.
Use the fail-closed local review server documented in
`held-video-review/README.md`; the checked-in HTML is explicitly unverified.
The server hashes every exact file before listening, displays its verification
time and held-set SHA lock, and stops if a locked file's stat identity changes.
Both approved corrected cuts have checksum-approved learner captions and
transcripts. Captions or transcripts attached to replacement-required sources are
checksum-locked review evidence and must not be treated as finalized learner
assets.
The machine-readable approval record is
`held-video-review/approvals.json`; no corrected candidate remains pending and
nine historical/source records are marked `changes_requested`, including the
superseded Terms v9 and KPIs v11 cuts. Prepared policy-safe scripts and source-
time replacement maps for all seven replacement-required sources are in
`held-video-recuts/`. Those packages do not change the held media or its
manifest status.

| Slot | Candidate | Duration | Size | SHA-256 | Current decision / next action |
|---|---|---:|---:|---|---|
| Welcome | `course-assets/review-lessonA/LESSON-1A-v7.mp4` | 246.186 seconds | 35,190,296 bytes | `493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72` | Terminal source evidence; replace role-title wording |
| Mindset | `course-assets/review-lessonB/LESSON-1B-v4.mp4` | 362.688 seconds | 107,220,021 bytes | `b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da` | Terminal source evidence; replace fixed week-one and week-six wording |
| Objection Scripts Playbook | `course-assets/review-lesson7B/LESSON-7B-v5.mp4` | 1,508.757 seconds | 572,011,027 bytes | `59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb` | Terminal source evidence; replace direct outcome guarantees |
| Closing and Deal Engineering | `course-assets/review-lesson11A/LESSON-11A-v4.mp4` | 329.429 seconds | 55,329,810 bytes | `6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2` | Terminal source evidence; replace role-bound narration and visuals |
| KPIs and Sales Telemetry | `course-assets/review-lesson12A/LESSON-12A-v12-LOCAL-POLICY-CUT.mp4` | 400.994 seconds | 53,799,917 bytes | `3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a` | Approved exact cut with checksum-approved learner captions and transcript |
| Compensation Engine | `course-assets/review-lesson17/LESSON-17-v1-QT.mp4` | 181.013 seconds | 45,346,253 bytes | `cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846` | Audio promises a ramp-up base, performance pay, milestone bonuses, and deal commissions. This conflicts with the role-agnostic current-written-plan rule. Verbatim review captions and transcript are in `course-assets/held-caption-review/`. |
| Operator Playbook | `course-assets/review-lesson18A/LESSON-18A-v10.mp4` | 378.858 seconds | 85,657,783 bytes | `6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048` | Audio hard-codes 60 to 80, 150 to 200, and 150-plus dial targets. This conflicts with the locked no-fixed-KPI rule. Verbatim review captions and transcript are in `course-assets/held-caption-review/`. |
| Career Growth Path | `course-assets/review-lesson19/LESSON-19-v7.mp4` | 252.949 seconds | 77,199,756 bytes | `1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9` | Audio hard-codes a role ladder, 90-day performance window, six-month and one-year promotion examples, higher earnings, commissions, and management compensation. This conflicts with reusable current-role-source-of-truth wording. Verbatim review captions and transcript are in `course-assets/held-caption-review/`. |

## Approval recording

The Terms Glossary v10 and KPIs v12 local-policy cuts were approved by Jarrad on
2026-07-17. Their exact SHA-256 values are
`6f57600d6ec3a596f96175052eda997503ab9b72aa5b7e9ec02239fe1a125769`.
and `3d50cc79cfe74277ac1311367d5b0bd6fd62d2d38c2c74fff8732ea62203d61a`.
The rejected source checksums remain in the append-only approval history.

For every future replacement, record the exact SHA-256, approval date, and
approver in the course review record. Approval of a filename without a matching
checksum is not enough because the local course-production folders contain older
and rejected cuts with similar names. The seven replacement-required source
hashes cannot transition to `approved`.
