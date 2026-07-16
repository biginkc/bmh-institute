# Held videos

Updated: 2026-07-16

## Review rule

Nine exact cuts are the only candidates for their slots. Six passed technical
QC but do not have a later explicit Jarrad approval in the inspected records.
The Compensation Engine, Operator Playbook, and Career Growth cuts were added to this hold
after exact-cut transcription exposed wording that conflicts with the locked
course policy. Do not substitute an older known-defective version. Do not change a
manifest asset from `hold` to `approved` until Jarrad has watched and approved
that exact file.

All nine use H264 video at 1600 by 900 in yuv420p plus AAC 48 kHz stereo audio.

| Slot | Candidate | Duration | Size | SHA-256 | Correction under review |
|---|---|---:|---:|---|---|
| Welcome | `course-assets/review-lessonA/LESSON-1A-v7.mp4` | 246.186 seconds | 35,190,296 bytes | `493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72` | Restores the missing cash-as-is paragraph and training-starts-now line |
| Mindset | `course-assets/review-lessonB/LESSON-1B-v4.mp4` | 362.688 seconds | 107,220,021 bytes | `b0cad612499dbd2d867c906c1ad8a8e3e13fcded333fa973fa6d19339fa930da` | Repairs the stranded opener line |
| Terms Glossary | `course-assets/review-lessonGLOA/LESSON-GLOA-v9.mp4` | 451.754 seconds | 110,768,219 bytes | `17cac99f171edfb773f85eaaa6719e09ffe1295abec5b062554c72958747c0bb` | Corrects the DOM pronunciation and broken tease or sign-off |
| Objection Scripts Playbook | `course-assets/review-lesson7B/LESSON-7B-v5.mp4` | 1,508.757 seconds | 572,011,027 bytes | `59c745ccca7387f82d0b13eaf95439f9f6a50a8f727ad3c1db4fb839050b1ebb` | Restores missing seller prompts and the tail word |
| Closing and Deal Engineering | `course-assets/review-lesson11A/LESSON-11A-v4.mp4` | 329.429 seconds | 55,329,810 bytes | `6e3aa1b007117b303a05906ca8443a8b9bc38f7c44bd61475c5437b99e7c90d2` | Removes the spoken dollar-X placeholder defect |
| KPIs and Sales Telemetry | `course-assets/review-lesson12A/LESSON-12A-v11.mp4` | 402.154 seconds | 56,052,870 bytes | `439f8d06d2e449637509f0f21f9d0b4a5464c65aec1995fca7147e4e4e67310b` | Uses the approved non-finale closer after discarded hand-garbled takes |
| Compensation Engine | `course-assets/review-lesson17/LESSON-17-v1-QT.mp4` | 181.013 seconds | 45,346,253 bytes | `cecad85478bb1a8ba5bfed7404dc045440c567ed0eaaa90b11b644e124b27846` | Audio promises a ramp-up base, performance pay, milestone bonuses, and deal commissions. This conflicts with the role-agnostic current-written-plan rule. Verbatim review captions and transcript are in `course-assets/held-caption-review/`. |
| Operator Playbook | `course-assets/review-lesson18A/LESSON-18A-v10.mp4` | 378.858 seconds | 85,657,783 bytes | `6e6a3f257ff8cf3ef201de775de47c6e7833e3abd673e44bb8d4d5ac3aafa048` | Audio hard-codes 60 to 80, 150 to 200, and 150-plus dial targets. This conflicts with the locked no-fixed-KPI rule. Verbatim review captions and transcript are in `course-assets/held-caption-review/`. |
| Career Growth Path | `course-assets/review-lesson19/LESSON-19-v7.mp4` | 252.949 seconds | 77,199,756 bytes | `1ddcf7b1b0b45bbc90ec14b3660b3d5f5a284b5095dd0d0682164924ce1a3da9` | Audio hard-codes a role ladder, 90-day performance window, six-month and one-year promotion examples, higher earnings, commissions, and management compensation. This conflicts with reusable current-role-source-of-truth wording. Verbatim review captions and transcript are in `course-assets/held-caption-review/`. |

## Approval recording

For each file, record the exact SHA-256, approval date, and approver in the
course review record. Approval of a filename without a matching checksum is not
enough because the local course-production folders contain older and rejected
cuts with similar names.
