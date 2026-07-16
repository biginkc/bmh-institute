# Production fixture ownership boundary

Captured from the read-only production export on 2026-07-16. This is a deletion manifest, not authorization to delete now.

## Locked boundary

Jarrad confirmed that BMH Institute has never been used for genuine learner activity and that none of the existing course content is worth salvaging. Even so, cleanup must target the pre-import fixture graph rather than issuing broad table deletes.

Delete only after the real unpublished program passes acceptance:

- The nine pre-import programs, 15 courses, 12 program-course links, 20 modules, 40 lessons, 79 content blocks, 10 quizzes, 17 questions, 45 answer options and 14 assignments captured in the rollback export.
- Their dependent fixture activity: seven assignment submissions, nine course certificates, three program certificates, 67 block-progress rows, 40 lesson-completion rows, 11 quiz attempts and 12 course-resume rows.
- Access rows owned by those records: 11 program-access rows and nine course-access rows.
- Walkthrough and browser-test role groups listed below, plus only the user-role links that point to those groups.

Do not delete:

- Profiles, authentication users, invites or the 427-row audit history.
- The `Appointment Setters` or `Lead Managers` reusable role groups.
- Certificate templates or certificate number counters.
- Testing infrastructure, migrations or reusable LMS content types.
- Any record created by the new manifest or any record whose ownership cannot be traced to the pre-import fixture IDs.

## Fixture role groups

- `19607a75-d76f-4068-b9cf-505ec9639b35` - BMH Institute Walkthrough Learners
- `ec6d3cd5-af97-4802-bfb6-28b362a402d7` - BROWSER-V1 Acquisitions VA
- `714710a5-b3bd-44a7-841b-ed9f8970ca9b` - BROWSER-V1 Lead Manager
- `15b6f18b-a353-4f1a-a22d-279925a91f3b` - BROWSER-V1 Dispositions VA
- `8a46607b-7055-478f-b31a-174d0caa6975` - BROWSER-V1 Admin Training
- `fead3cac-6a44-4eb4-b71b-434df29a57d6` - BROWSER-V1 Empty Access Group
- `d41e753f-d158-4bf0-8729-da52347b77b1` - BROWSER-V1 Multi-Track Learner
- `2f5371cc-bc09-48a3-8236-47d0d3ba3678` - BROWSER-V1 MAP Role Group 20260602050844

## Execution guard

The cleanup command must consume an exact manifest of the pre-import IDs, verify that every dependent row points only into that graph, print a dry-run reconciliation, and stop if counts or references differ. Cascades must be previewed. The production apply remains blocked until the draft import, browser acceptance and rollback rehearsal pass.
