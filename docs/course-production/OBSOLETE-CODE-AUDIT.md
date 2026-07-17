# Obsolete-code cleanup audit

Audited: 2026-07-17  
Repository head: `e988dc91aea76e4601c1cd4db0574939acaa5ca9`  
Mode: read-only audit; no package, source, schema, fixture, storage, or production deletion was performed.

## Verdict

Cleanup must remain deferred. The Tech Stack canary and complete real manifest
have not passed unpublished import plus learner/admin acceptance, and the real
catalog has not replaced the fixture catalog. The only deletion set that is
already exact enough for eventual execution is the checksum-locked 463-row
fixture graph, but even that command is deliberately unauthorized until the
real course passes acceptance, a fresh backup and restore rehearsal exist, and
Jarrad supplies a separate current approval record.

The current full manifest is the relevant product boundary: one draft program,
one reusable course, six modules, 19 grouped content lessons, 19 randomized
quiz lessons, six reviewed assignment lessons, 29 videos, six required Closer
Lab blocks, 19 flashcard blocks, and 19 guide downloads. It enables one program
certificate and disables only this course's course certificate. A feature not
used by this first course is not automatically obsolete because the locked
product is a reusable internal learning platform.

## Proven delete candidates, only after acceptance

| Candidate | Classification | Current evidence and required sequencing |
| --- | --- | --- |
| Hard-coded walkthrough/demo system | **Proven-delete-after-acceptance** | `package.json` exposes `seed:walkthrough`; `scripts/seed-walkthrough-onboarding.ts` consumes only `src/lib/walkthrough/curriculum.ts`; `src/components/walkthrough-caption-overlay.tsx` consumes `src/lib/walkthrough/bmh-demo.ts`; and `src/app/layout.tsx` is the only production mount. No E2E or real-manifest source consumes the walkthrough query contract. Delete the command, seed script, both walkthrough modules, overlay, their tests, the root-layout mount, and update walkthrough-only documentation only after the real course replaces the onboarding/demo path. |
| Drag-and-drop packages | **Proven-delete-after-acceptance** | Repository source has zero imports of `@dnd-kit/core`, `@dnd-kit/sortable`, or `@dnd-kit/utilities`. Current admin ordering uses explicit move operations and `fn_move_module`. Remove all three together, refresh the lockfile with a clean install, and repeat editor ordering UAT. Spec and `AGENTS.md` mentions are documentation, not runtime imports. |
| Zero-import legacy UI primitives | **Proven-delete-after-acceptance** | These files have zero imports outside themselves: `src/components/ui/badge.tsx`, `brand-lockup.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `select.tsx`, `separator.tsx`, `skeleton.tsx`, and `table.tsx`. Delete only after a fresh import scan, clean build, and desktop/mobile acceptance. The similarly named BMH design-system components are active and are not part of this set. |
| Exact fixture catalog graph | **Proven-delete-after-acceptance** | `fixture-boundary-manifest.json` and migration 021 lock 463 identities: 9 programs, 12 program-course links, 15 courses, 20 modules, 40 lessons, 79 blocks, 10 quizzes, 17 questions, 45 options, 14 assignments, access/role links, exactly six invites, and fixture activity/certificates/resume rows. Storage deletion count is zero. Profiles, auth users, audit history, certificate templates, counters, reusable role groups, all unlisted invites, all real-import rows, and testing infrastructure are excluded. Use only the guarded atomic cleanup after canary/full acceptance and the separate backup/approval gates. |
| `certificates.pdf_path` and `program_certificates.pdf_path` | **Unresolved until after fixture cleanup** | No application certificate page or Sandra delivery path reads these fields; certificates are rendered as HTML and linked to scoped routes. The fields remain in the E2E write-path probe and, critically, in the exact fixture fingerprints. Dropping them before fixture cleanup would invalidate the cleanup column-set guard. Re-audit database dependencies and live values after fixture cleanup; if still unused, remove via a new migration and update types/tests. |

## Already removed; do not schedule a second deletion

| Surface | Classification | Evidence |
| --- | --- | --- |
| Manual lesson/block completion bypass | **Already removed** | Current server exports are video observation/resume, signed Closer Lab completion, quiz submission, and reviewed assignment operations. Git history shows `markLessonComplete` and `markBlockComplete` were deleted by the runtime-hardening change. Required video completion now depends on authored duration and 90% watched-range coverage. There is no current manual-complete action or button to delete. |
| Nonfunctional notification bell | **Already removed** | Current source contains no `Bell` import or notification button. Git history shows it was removed when working lesson search replaced the inert header control. Sonner toasts are unrelated and active. |

## Retain

| Candidate from the original cleanup plan | Classification | Concrete evidence |
| --- | --- | --- |
| `src/components/ui/sheet.tsx` | **Retain** | Active import in `src/app/(dashboard)/mobile-nav.tsx`. The prior inventory's zero-import claim is false. |
| `button`, `card`, `label`, `sonner`, and `tooltip` legacy primitives | **Retain** | Active imports exist in file upload, lesson rendering, admin editors, root layout, and mobile navigation. |
| BMH design-system components, including `IconButton`, `Avatar`, and `Table` | **Retain** | Active across dashboard navigation, quiz/block/module editors, role groups, course/program tables, certificate layout, login, and the design-system specimen. Do not confuse these with same-named zero-import files under `src/components/ui`. |
| `passing_score` / quiz threshold | **Retain** | All 19 real quizzes use `passing_score: 80`; it is validated by both manifest validators, imported by the atomic apply path, editable in admin, read by the lesson UI, and used by server-side scoring. The original planned removal is contradicted by current runtime use. |
| `answer_options_public` view | **Retain** | This is the authenticated learner-safe projection used by answer-option isolation tests and the fixture-boundary reader. Migrations 009 and 014 explicitly preserve row filtering while withholding `is_correct`. It is a security boundary, not obsolete compatibility residue. |
| Completion, certificate, access, import, rollback, and admin RPCs | **Retain** | `fn_user_has_*` functions are RLS dependencies; completion helpers call one another and certificate triggers; `fn_lesson_is_unlocked` is used by all learner completion paths; certificate functions are trigger targets; import/rollback/fixture cleanup are service-role commands; admin functions back current editors. Trigger functions with no TypeScript reference are still invoked by database triggers. `fn_preserve_catalog_content_import_id` is not a current object: migration 020 already drops it. |
| Historical migrations | **Retain** | The migrations are the append-only shared-database history and authorization proof. Any cleanup must be a new migration; rewriting old migrations would make existing environments irreconcilable. |
| Program/course access and role groups | **Retain** | RLS, invitations, admin assignment, reports, profile display, course import, and the manifest's private QA group all depend on them. |
| Both certificate scopes and certificate templates | **Retain** | This first program enables the program certificate and disables only its course certificate. Course certificates remain a reusable platform feature with active pages, reporting, triggers, Sandra links, and admin controls. |
| Media/content block types | **Retain** | The real manifest directly uses text, video, download, flashcard, and role-play. Image, PDF, audio, external link, embed, divider, and callout remain fully authored and rendered reusable platform types. Lack of use in the first course is not deletion proof. Poster, caption, transcript, thumbnail, and PDF assets are directly required by the real manifest. |
| Fixture test infrastructure and guarded cleanup command | **Retain** | Tests, seed fixtures, rollback/apply verifiers, and the dormant service-role cleanup RPC are required to prove import security, idempotency, rollback, and exact deletion. Delete only fixture-owned data, not the safety machinery. |
| Lesson search | **Retain** | `src/app/(dashboard)/layout.tsx` loads RLS-scoped lesson IDs/titles and mounts `LessonSearch` for desktop and mobile. It has keyboard/mobile tests and replaced the inert header search. |
| Sonner and `next-themes` | **Retain pending separate simplification review** | Sonner is imported across learner and admin mutation flows; the root layout mounts its toaster, and its adapter directly calls `useTheme` from `next-themes`. This is not a zero-import package. A future provider/runtime simplification may remove `next-themes`, but current evidence does not prove that safe. |

## Unresolved compatibility and field candidates

| Candidate | Classification | Why unresolved |
| --- | --- | --- |
| `/admin/reports/pilot/export` and `src/lib/pilot-monitoring/*` / `pilot-cohort/*` names | **Unresolved; retain now** | Visible UI and E2E use `/admin/reports/learners/export`, but that route currently re-exports the implementation from the pilot path, and current reports/users pages import the internally named libraries. Refactoring names may be worthwhile, but deleting the old route first would break the live route. External bookmarks/API callers have not been disproved. |
| `profiles.avatar_url` | **Unresolved; retain now** | The active Avatar UI currently renders initials and no application source reads `avatar_url`; however, no production-value, external-consumer, or future-profile contract audit has proved the schema field disposable. Removing it requires a separate data/dependency migration review. |
| `next-themes` simplification | **Unresolved; retain now** | It has one direct runtime import through the active Sonner adapter. Prove toaster behavior under system/dark/light settings before changing it. |
| Direct dev dependencies with no literal import, such as `@testing-library/dom` and `@types/*` | **Retain** | Literal-import counts are not proof for peer dependencies or ambient type packages. `npm ls` shows `@testing-library/dom` is a peer used by React Testing Library and user-event; the `@types/*` packages participate through TypeScript resolution. |

## Contradictions found

1. `OBSOLETE-CODE-INVENTORY.md` lists `sheet` as a zero-import primitive, but
   `mobile-nav.tsx` imports it. It is active and must be removed from the
   deletion list.
2. The original cleanup plan describes a dead quiz threshold, but the real
   19-quiz manifest and current scoring/editor/import paths all use
   `passing_score`.
3. The original plan treats a compatibility view/RPC residue as deletable, but
   `answer_options_public` is part of answer-key isolation and the apparently
   source-unused completion/certificate helpers are SQL/RLS/trigger
   dependencies.
4. The full manifest has no separate role-play lesson rows. Its six required
   Closer Lab scenarios are role-play blocks embedded in grouped content
   lessons. A cleanup query based only on lesson type would incorrectly report
   zero scenarios.
5. A top-level manifest query is misleading because courses and modules are
   nested under `.program`. Cleanup validation must use the nested real shape.
6. `pdf_path` appears dead to the application, but it cannot be dropped before
   exact fixture cleanup because the cleanup RPC intentionally fingerprints
   current column sets and values.

## Reproducible evidence commands

Run these from the integration worktree at the audited head:

```bash
git rev-parse HEAD

jq '{sections:(.program.courses[0].modules|length),content_lessons:([.program.courses[0].modules[].lessons[]|select(.type=="content")]|length),quiz_lessons:([.program.courses[0].modules[].lessons[]|select(.type=="quiz")]|length),assignment_lessons:([.program.courses[0].modules[].lessons[]|select(.type=="assignment")]|length),videos:([.program.courses[0].modules[].lessons[].blocks[]?|select(.type=="video")]|length),role_play_blocks:([.program.courses[0].modules[].lessons[].blocks[]?|select(.type=="role_play")]|length),flashcards:([.program.courses[0].modules[].lessons[].blocks[]?|select(.type=="flashcard")]|length),guides:([.program.courses[0].modules[].lessons[].blocks[]?|select(.type=="download")]|length)}' content/course-manifests/bmh-employee-training.v1.json

rg -n '@dnd-kit' --glob '!package-lock.json' --glob '!package.json' --glob '!docs/**' --glob '!node_modules/**' .

for f in src/components/ui/*.tsx; do b=$(basename "$f" .tsx); n=$(rg -l "@/components/ui/$b|components/ui/$b" src scripts e2e --glob "!src/components/ui/$b.tsx" 2>/dev/null | wc -l | tr -d ' '); printf '%s %s\n' "$b" "$n"; done

rg -n 'walkthrough|bmh-demo|seed:walkthrough|seed-walkthrough|WalkthroughCaption' --glob '!docs/**' --glob '!package-lock.json' --glob '!node_modules/**' .

rg -n 'markLessonComplete|markBlockComplete|Mark complete|\bBell\b|aria-label="Notifications"' src

rg -n 'passing_score' src scripts content/course-manifests/bmh-employee-training.v1.json supabase/migrations --glob '!**/*.test.*'

rg -n 'answer_options_public|fn_user_has_|fn_lesson_is_|fn_issue_.*certificate|trg_after_' src scripts supabase/migrations

rg -n 'pdf_path|avatar_url|next-themes|useTheme|/admin/reports/(pilot|learners)/export' src scripts e2e e2e-prod supabase/migrations

npm ls @testing-library/dom @types/nodemailer @types/sanitize-html @types/mailparser @types/node @types/react @types/react-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --depth=2

node scripts/course-content/validate-manifest.mjs content/course-manifests/bmh-employee-training.v1.json content/course-manifests/bmh-operating-stack-confirmation.v1.json

npx vitest run src/lib/fixture-cleanup/guards.test.ts src/lib/fixture-cleanup/fixture-cleanup.test.ts src/lib/fixture-cleanup/atomic-migration.test.ts src/lib/security/quiz-disclosure-migration.test.ts src/lib/security/runtime-migration.test.ts src/lib/certificates/pipeline.integration.test.ts --reporter=dot
```

At the audited head, manifest validation returned zero structural errors and 82
intentional publication blockers. Its computed summary was six modules, 19
content lessons, 19 quizzes, six assignments, 29 videos, 342 questions, 152
flashcards, six role plays, 29 posters, and 19 guides. The targeted Vitest
command selected five configured test files and passed all 28 tests. These are
supporting checks for the audit boundary; they do not substitute for canary,
full import, or Chrome acceptance.

## Cleanup gate order

1. Approve required videos and three-thumbnail pilot, then produce all gated
   derivatives.
2. Pass Tech Stack canary upload/apply/reconciliation in the unpublished QA
   hierarchy.
3. Pass complete-manifest upload/apply/reconciliation and desktop/mobile
   learner plus admin acceptance.
4. Re-run source import, package, schema dependency, production reference, and
   storage scans against the accepted real catalog.
5. Take a fresh production backup, perform the isolated restore rehearsal, and
   obtain the exact current cleanup approval record.
6. Execute only the exact 463-row fixture cleanup and reconcile retained rows.
7. Remove the proven source/package candidates, then clean-install, test,
   typecheck, build, and repeat Chrome acceptance.
8. Re-audit unresolved schema and compatibility candidates. Do not infer their
   deletion from the first course's content mix.
