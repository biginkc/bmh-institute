# BMHI-EXEC-14 convergence ledger

## Goal

Implement the Jarrad-approved learner-experience redesign from `is-there-any-chance-spicy-ember.md`, including the amended 17 locked items and PLANREV-02 changes a through m.

## Hard boundaries

- Local code and test work only.
- No schema or data migration.
- No hosted-project writes or provider spending.
- No import-pipeline, fixture-cleanup framework, or migration-rehearsal changes.
- Preserve session-client RLS and private-review access behavior.
- Claude owns git operations, PR creation, and convergence review.

## Acceptance ledger

| Gate | Evidence | Status |
| --- | --- | --- |
| Composite projection | Fail-closed content and quiz pairing, 25-tile unit coverage, assignment review states, block progress, resume mapping | PASS |
| Learner vocabulary | Dashboard, course, lesson, certificate, and enrollment learner copy use Course, Module, Lesson | PASS |
| Dashboard and course | Shared paginated module grid plus all-lesson progress rail and compact resume | PASS |
| Lesson experience | One clamped part at a time, video then role play then quiz then guide, standalone assignments | PASS |
| Guide security | Guides filtered before privileged signing and absent from pre-pass rendered HTML | PASS |
| Compatibility | Old quiz routes and search results map to composite quiz part; quiz action revalidates composite route | PASS |
| Flashcards | Hidden by the shared learner block partition across all courses | PASS |
| Certificates | Program-scope legacy copy normalized at render time with no data write | PASS |
| Role-play content | Six pending blocks preserved across five lessons, including two ordered parts in slot 18 | BLOCKED ON CONTENT, EXPECTED |
| Local tests | Unit and RTL suite, lint, typecheck, build, Playwright discovery | PASS |
| Hosted learner gating | Separate later TEST fixture order per work order | DEFERRED |

## Adversarial findings fixed

1. Objectives classifier originally missed the expanded phrase `What you will learn`. The expression now handles expanded and contracted forms.
2. A forged `part=quiz` request could select a locked part without a clamp. Selection now falls back to the first available incomplete part.
3. A stale guide block resume could point at the locked guide. Resume now falls back to video or the unlocked quiz.
4. Supporting blocks were initially placed before the first video. They now follow the video so the lesson opens on video.
5. The first projection did not carry individual video and role-play completion. The session-scoped loader now validates current video asset versions and includes completed block IDs.
6. Empty assignment or block ID lists could reach PostgREST `in` filters. Both now use safe empty results.

## Convergence handoff

Claude should independently inspect the actual diff, run the required review and tests, and verify that no unrelated pre-existing untracked planning artifacts are included in commits.
