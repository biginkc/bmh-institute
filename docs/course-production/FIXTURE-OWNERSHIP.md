# Production fixture ownership boundary

Captured from the read-only production export on 2026-07-16. This is a deletion manifest, not authorization to delete now.

## Locked boundary

Jarrad confirmed that BMH Institute has never been used for genuine learner activity and that none of the existing course content is worth salvaging. Even so, cleanup must target the pre-import fixture graph rather than issuing broad table deletes.

Delete only after the real unpublished program passes acceptance:

- The nine pre-import programs, 15 courses, 12 program-course links, 20 modules, 40 lessons, 79 content blocks, 10 quizzes, 17 questions, 45 answer options and 14 assignments captured in the rollback export.
- Their dependent fixture activity: seven assignment submissions, nine course certificates, three program certificates, 67 block-progress rows, 40 lesson-completion rows, 11 quiz attempts and 12 course-resume rows.
- Access rows owned by those records: 11 program-access rows and nine course-access rows.
- Walkthrough and browser-test role groups listed below, plus only the user-role links that point to those groups.
- Exactly the six fixture-owned invite rows listed below. Their complete column sets and row checksums are locked by `fixture-boundary-manifest.json` and migration 021; drift or any additional invite reference blocks cleanup.

Do not delete:

- Profiles, authentication users, the 427-row audit history, or any invite not in the exact six-row fixture set below.
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

## Fixture-owned invites

Only these six checksum-locked invites are deletion candidates:

| Invite ID | Complete-row SHA-256 | Classification |
| --- | --- | --- |
| `07caa94e-3496-4d19-9797-ddc12dd99641` | `b9b0aaafa6959944687ea59efbc6e329c6eb6ad8c48e2145601b88d44a3a6c06` | Browser V1 fixture |
| `1dec82ba-b443-4166-ba26-68b3c825ec60` | `d9ed3e0d06a8ca1d33d02d4864b9d0a83211093ddbe9cbbc8fc2c77ecfc54e94` | Legacy training fixture resolved by the explicit empty-app declaration |
| `679d38e3-adda-4c44-a977-3c9730c9930e` | `7f299388af1dde273ebecd4fa9827e99a87ef891dc0fc6b7aee2d70a3d1ec3c2` | Legacy training fixture resolved by the explicit empty-app declaration |
| `acaa2f65-cf6e-4a74-ac01-fa9c86a9bd97` | `e9f22d52d9f76be6d7546462faf329041ab238be7a27f5631fe80fb95f7d9c0e` | Browser V1 fixture |
| `cbb0c909-a3f7-474f-a02b-c4c5192d067d` | `d5f9f6797f114dee10a0efb78b4620ec14a779c4e17debbef19645041f6fb419` | Browser V1 fixture |
| `d5757f8f-aebd-43d6-8ef6-3ed5807a21df` | `a85ca3c9c8507585727fa28ea89a9f983a6386329019043983b3e51fb73eb298` | Browser V1 fixture |

Every other existing or future invite is retained. Cleanup may not select invites by email, age, acceptance status, role group, or title; it may delete only an exact ID above after the full row still matches its locked checksum.

## Execution guard

The cleanup command must consume an exact manifest of the pre-import IDs, verify that every dependent row points only into that graph, print a dry-run reconciliation, and stop if counts or references differ. Cascades must be previewed. The production apply remains blocked until the draft import, browser acceptance and rollback rehearsal pass.

Controller-key provisioning, retirement, and gate disablement must run through
the `cleanup:fixtures:key:provision`, `cleanup:fixtures:key:retire`, and
`cleanup:fixtures:disable` package commands. Those commands parse the database
URL and refuse before starting `psql` unless its host, project-scoped user,
port, database, and TLS mode exactly match the production BMH Institute
Supabase target. The SQL files are defense-in-depth implementations, not direct
operator entrypoints.
