# BMH Institute course import manifest

Updated: 2026-07-16

## Import target

- Production app: `https://institute.bmhgroupkc.com`
- Program: `BMH Group Training`
- Course: `BMH Group Training`
- Initial visibility: unpublished
- Source of truth for order and wording:
  `/Users/jarradhenry/BMH-OS/BMH Training Course/Thinkific/_master-transcripts.md`
- Current production LMS records are disposable verification fixtures. Do not
  delete them until this unpublished course has passed the canary lesson check.

## Media readiness

The 29 selected source files are present locally and total 2.434 GiB. The
production `content` bucket allows individual files up to 2 GiB. The current
browser uploader uses a standard one-shot upload even though every lesson is
larger than the size for which Supabase recommends resumable TUS uploads. Fix or
bypass that upload path before the bulk media transfer; do not attempt all 29
through the current button.

`LOAD` means the approved source can be imported. `HOLD` means a newer corrected
cut passed technical QC after the original slate was declared complete, but the
records inspected on 2026-07-16 do not contain a later explicit Jarrad approval.
Never substitute the older known-defective cut for a held correction.

| # | Section | Lesson | Source file | Gate |
|---:|---|---|---|---|
| 1 | Orientation | Welcome / Navigator's Playbook | `course-assets/review-lessonA/LESSON-1A-v7.mp4` | HOLD |
| 2 | Orientation | Mindset | `course-assets/review-lessonB/LESSON-1B-v4.mp4` | HOLD |
| 3 | Orientation | Terms Glossary | `course-assets/review-lessonGLOA/LESSON-GLOA-v9.mp4` | HOLD |
| 4 | Orientation | Tech Stack | `course-assets/review-lessonTECHA/LESSON-TECHA-v5.mp4` | LOAD |
| 5 | Who We Serve | Humanizing the Lead A | `course-assets/review-lesson2A/LESSON-2A-v1-FINAL.mp4` | LOAD |
| 6 | Who We Serve | Humanizing the Lead B | `course-assets/review-lesson2B/LESSON-2B-v3-FULL.mp4` | LOAD |
| 7 | Who We Serve | Ideal Seller Profile | `course-assets/review-lessonISP/LESSON-ISP-v6.mp4` | LOAD |
| 8 | Who We Serve | BMH Offer Playbook A | `course-assets/review-lesson3A/LESSON-3A-rev1-FULL.mp4` | LOAD |
| 9 | Who We Serve | BMH Offer Playbook B | `course-assets/review-lesson3B/LESSON-3B-v1-FULL.mp4` | LOAD |
| 10 | The Conversation | Sales Pipeline & Stage Ownership A | `course-assets/review-lesson4A/LESSON-4A-v3.mp4` | LOAD |
| 11 | The Conversation | The Five-Step Conversation Framework | `course-assets/review-lesson4B/LESSON-4B-v1-APPROVED.mp4` | LOAD |
| 12 | The Conversation | Opening the Call | `course-assets/review-lesson5A/LESSON-5A-v3-FINAL.mp4` | LOAD |
| 13 | The Conversation | The Fact Find | `course-assets/review-lesson5B/LESSON-5B-v1-FINAL.mp4` | LOAD |
| 14 | The Conversation | Discovery | `course-assets/review-lesson6A/LESSON-6A-v2-FULL.mp4` | LOAD |
| 15 | The Conversation | The Handoff | `course-assets/review-lesson6B/LESSON-6B-v3.mp4` | LOAD |
| 16 | Objections & Questions | Objection Architecture | `course-assets/review-lesson7A/LESSON-7A-v1-FULL.mp4` | LOAD |
| 17 | Objections & Questions | Objection Scripts Playbook | `course-assets/review-lesson7B/LESSON-7B-v5.mp4` | HOLD |
| 18 | Objections & Questions | Complex Objections | `course-assets/review-lesson8A/LESSON-8A-v1-FULL.mp4` | LOAD |
| 19 | Objections & Questions | Trust & People Objections | `course-assets/review-lesson8B/LESSON-8B-v2.mp4` | LOAD |
| 20 | Objections & Questions | Seller FAQ Decoder Q1-Q5 | `course-assets/review-lesson9A/LESSON-9A-v1-FULL.mp4` | LOAD |
| 21 | Objections & Questions | Seller FAQ Decoder Q6-Q10 | `course-assets/review-lesson9B/LESSON-9B-v3.mp4` | LOAD |
| 22 | Cadence, Scripts & Close | Follow-Up Cadence | `course-assets/review-lesson10A/LESSON-10A-v6.mp4` | LOAD |
| 23 | Cadence, Scripts & Close | Conversation Flow Mastery | `course-assets/review-lesson1C/LESSON-1C-v3-FULL.mp4` | LOAD |
| 24 | Cadence, Scripts & Close | Closing & Deal Engineering | `course-assets/review-lesson11A/LESSON-11A-v4.mp4` | HOLD |
| 25 | Performance & Career | KPIs & Sales Telemetry | `course-assets/review-lesson12A/LESSON-12A-v11.mp4` | HOLD |
| 26 | Performance & Career | Compensation Engine | `course-assets/review-lesson17/LESSON-17-v1-QT.mp4` | LOAD |
| 27 | Performance & Career | Operator Playbook | `course-assets/review-lesson18A/LESSON-18A-v10.mp4` | LOAD |
| 28 | Performance & Career | Daily Mission Control | `course-assets/review-lesson18B/LESSON-18B-v7.mp4` | LOAD |
| 29 | Performance & Career | Career Growth Path | `course-assets/review-lesson19/LESSON-19-v7.mp4` | LOAD |

## Safe execution order

1. Create the unpublished program, course, six modules, and 29 lesson shells.
2. Upgrade the admin video uploader to resumable TUS uploads, or use a controlled
   resumable import tool that writes the same private `content` bucket paths.
3. Import one approved lesson as a canary. Use Lesson 4, `Tech Stack`, because it
   is approved, representative, and only about 85 MiB.
4. In production Chrome, verify admin upload, learner playback, signed URL load,
   video progress, lesson completion, resume, desktop, and narrow/mobile layout.
5. Import the other `LOAD` lessons. Keep `HOLD` lesson shells unpublished or
   without a media block until approval is recorded.
6. Reconcile all 29 titles, order, file sizes, and playback outcomes.
7. Only after the real course passes: snapshot the database, remove the disposable
   verification catalog, and publish the real program/course.
