# BMH Training Platform Build Spec

Internal Thinkific replacement for BMH Group VA training. Upload content, build quizzes, assign by role, issue certificates. Not a content generator. Supabase backend, React frontend, self-hosted video plus external embeds.

## Stack

Mirrors Sandra CRM's stack so UI, conventions, testing, and developer experience stay consistent across the two platforms. BMH Institute runs as its own Next.js app and its own Supabase project — auth and data are isolated, visual language and code conventions are shared.

Next.js 16 + React 19 (App Router, Server Components, Server Actions)
TypeScript strict
Tailwind 4 (CSS-first @theme config) + shadcn v4 + Base UI (@base-ui/react)
@supabase/ssr + @supabase/supabase-js for auth and Postgres access
@dnd-kit (core, sortable, utilities) for drag-and-drop reordering at every level
sonner for toasts, lucide-react for icons, date-fns for dates
@react-pdf/renderer or pdf-lib for certificate PDF generation
HTML5 video player for Supabase-hosted video, iframe embeds for YouTube/Vimeo/Loom
Resend or Postmark for transactional email (invites, password resets)
Supabase (auth, Postgres, RLS, Storage, Edge Functions) — new project `bmh-institute` (ref `dhvfsyteqsxagokoerrx`), independent from `sandra-crm`
Vercel for hosting — new project `bmh-institute`, independent from `sandra`
Vitest for unit + integration tests
Playwright for e2e
Husky + ESLint for git hooks and linting

Target monthly cost: ~$10 Supabase + $0 Vercel (free tier sufficient for internal team). Video storage over 100 GB would require Supabase Pro, still well under Thinkific.

## Core Concepts

Programs are the top-level container, grouping one or more Courses into a learning journey (e.g. "Appointment Setter Onboarding"). A Course can belong to zero, one, or many Programs (many-to-many). Courses contain ordered Modules. Modules contain ordered Lessons. A Lesson is one of three types:

1. Content lesson — a blank canvas of ordered Content Blocks (video, text, PDF, image, audio, download, external link, embed).
2. Quiz lesson — wraps a single Quiz with randomization, pass thresholds, and retake logic.
3. Assignment lesson — wraps a single Assignment with a submission form and reviewer workflow.

Access is granted via Role Groups. A Role Group can be assigned to a Program (cascades to all its Courses) or directly to a standalone Course. A user in multiple Role Groups sees the union of their assigned content.

Certificates are issued at both the Course level (on course completion) and the Program level (on completion of all required Courses in the Program).

Lessons open as their own page. Layout: left sidebar with curriculum tree (Program → Course → Module → Lesson) showing lock and completion state; center pane rendering the active lesson.

## Roles

Three system roles baked into profiles:

- **owner** — Jarrad, full admin access including billing and destructive actions.
- **admin** — second tier, manages courses, programs, users, quizzes, submissions. No billing.
- **learner** — default for VAs and team members, sees only content granted via their Role Groups.

Beyond system roles, custom Role Groups (e.g. "Appointment Setters", "Lead Managers", "Acquisitions") are created by admins and used for access assignment.

## Database Schema

All tables use uuid primary keys with gen_random_uuid() defaults. Timestamps default to now() and are updated via trigger on row update.

### profiles
Extends Supabase auth.users. One row per auth user.
- id (uuid, pk, references auth.users.id)
- email (text)
- full_name (text)
- avatar_url (text, nullable)
- system_role (text, check in ('owner', 'admin', 'learner'), default 'learner')
- status (text, check in ('active', 'invited', 'suspended'), default 'invited')
- created_at, updated_at

### role_groups
- id (uuid, pk)
- name (text, unique)
- description (text, nullable)
- created_at, updated_at

### user_role_groups
- user_id (uuid, references profiles.id, on delete cascade)
- role_group_id (uuid, references role_groups.id, on delete cascade)
- primary key (user_id, role_group_id)

### programs
Top-level container grouping one or more courses.
- id (uuid, pk)
- title (text)
- description (text, nullable)
- thumbnail_url (text, nullable)
- is_published (boolean, default false)
- course_order_mode (text, check in ('sequential', 'free'), default 'free') — sequential locks each course until the prior is complete; free lets the learner pick any order
- certificate_enabled (boolean, default true)
- certificate_template_id (uuid, nullable, references certificate_templates.id)
- sort_order (integer, default 0)
- created_at, updated_at

### courses
- id (uuid, pk)
- title (text)
- description (text, nullable)
- thumbnail_url (text, nullable)
- is_published (boolean, default false)
- certificate_enabled (boolean, default true)
- certificate_template_id (uuid, nullable, references certificate_templates.id)
- sort_order (integer, default 0)
- created_at, updated_at

### program_courses
Many-to-many join of programs and courses, with order per program.
- id (uuid, pk)
- program_id (uuid, references programs.id, on delete cascade)
- course_id (uuid, references courses.id, on delete cascade)
- sort_order (integer) — order of the course within this program (used when course_order_mode is 'sequential')
- unique (program_id, course_id)

### program_access
Grants a role group access to a program (cascades to contained courses).
- id (uuid, pk)
- program_id (uuid, references programs.id, on delete cascade)
- role_group_id (uuid, references role_groups.id, on delete cascade)
- unique (program_id, role_group_id)

### course_access
Grants a role group direct access to a course (for standalone courses or explicit per-course grants).
- id (uuid, pk)
- course_id (uuid, references courses.id, on delete cascade)
- role_group_id (uuid, references role_groups.id, on delete cascade)
- unique (course_id, role_group_id)

Owners and admins see all programs and courses implicitly via RLS. A learner has access to a course if a role_group they belong to is granted access to that course directly OR to any program that contains the course.

### modules
- id (uuid, pk)
- course_id (uuid, references courses.id, on delete cascade)
- title (text)
- description (text, nullable)
- sort_order (integer)
- created_at, updated_at

### lessons
Three kinds: content, quiz, assignment. Quiz and assignment lessons reference their respective tables. Content lessons own a set of content_blocks.
- id (uuid, pk)
- module_id (uuid, references modules.id, on delete cascade)
- title (text)
- description (text, nullable)
- lesson_type (text, check in ('content', 'quiz', 'assignment'))
- quiz_id (uuid, nullable, references quizzes.id) — populated only when lesson_type = 'quiz'
- assignment_id (uuid, nullable, references assignments.id) — populated only when lesson_type = 'assignment'
- prerequisite_lesson_id (uuid, nullable, references lessons.id) — must be completed before this lesson unlocks
- prerequisite_quiz_min_score (integer, nullable) — if prerequisite_lesson_id points at a quiz lesson, require this score to unlock
- is_required_for_completion (boolean, default true)
- sort_order (integer)
- created_at, updated_at

Check constraint: quiz_id is non-null iff lesson_type = 'quiz'; assignment_id is non-null iff lesson_type = 'assignment'.

### content_blocks
Ordered content inside a content lesson. Never populated for quiz or assignment lessons.
- id (uuid, pk)
- lesson_id (uuid, references lessons.id, on delete cascade)
- block_type (text, check in ('video', 'text', 'pdf', 'image', 'audio', 'download', 'external_link', 'embed', 'divider', 'callout'))
- content (jsonb) — shape depends on block_type, see below
- sort_order (integer)
- is_required_for_completion (boolean, default true) — must this block be marked complete for the lesson to count as done
- created_at, updated_at

Content jsonb shapes per block_type:

- **video**: `{ source: 'upload'|'youtube'|'vimeo'|'loom'|'embed', file_path?: string, url?: string, duration_seconds?: integer, captions_path?: string }`
  Completion: playback reaches 90%, or learner clicks "Mark complete".
- **text**: `{ html: string }` — rich text rendered as sanitized HTML.
  Completion: scrolled to end or manual mark.
- **pdf**: `{ file_path: string, display: 'inline'|'download' }` — inline uses a PDF.js viewer.
  Completion: scrolled to last page or manual mark.
- **image**: `{ file_path: string, alt: string, caption?: string }`
  Completion: viewed.
- **audio**: `{ source: 'upload'|'url', file_path?: string, url?: string, duration_seconds?: integer }`
  Completion: playback reaches 90% or manual mark.
- **download**: `{ file_path: string, filename: string, size_bytes: integer, description?: string }`
  Completion: downloaded or manual mark.
- **external_link**: `{ url: string, label: string, description?: string, open_in_new_tab: boolean }`
  Completion: clicked or manual mark.
- **embed**: `{ iframe_src: string, aspect_ratio: '16:9'|'4:3'|'1:1'|'custom', custom_height_px?: integer, allow?: string }` — for Loom, Figma, Google Docs, etc.
  Completion: manual mark.
- **divider**: `{}` — visual separator, not counted for completion.
- **callout**: `{ variant: 'info'|'warning'|'success'|'note', markdown: string }` — styled informational box, not counted for completion.

### quizzes
- id (uuid, pk)
- title (text)
- description (text, nullable)
- passing_score (integer, default 80) — percent 0 to 100
- randomize_questions (boolean, default true)
- randomize_answers (boolean, default true)
- questions_per_attempt (integer, nullable) — if set, pulls this many at random from the quiz's pool; null means serve all
- max_attempts (integer, nullable) — null means unlimited
- retake_cooldown_hours (integer, default 0)
- show_correct_answers_after (text, check in ('never', 'after_pass', 'always'), default 'after_pass')
- created_at, updated_at

### questions
Authored per-quiz. (A shared question bank across quizzes is a future addition and does not require breaking changes to this schema.)
- id (uuid, pk)
- quiz_id (uuid, references quizzes.id, on delete cascade)
- question_text (text)
- question_type (text, check in ('true_false', 'single_choice', 'multi_select'))
- explanation (text, nullable) — shown after answering if show_correct_answers_after permits
- points (integer, default 1)
- sort_order (integer) — baseline order; per-attempt randomization overrides
- created_at, updated_at

### answer_options
- id (uuid, pk)
- question_id (uuid, references questions.id, on delete cascade)
- option_text (text)
- is_correct (boolean, default false)
- sort_order (integer)
- created_at

For true_false questions, seed two options ("True" and "False") with is_correct set appropriately. Answer options are rendered without letter prefixes (no A/B/C); positions are randomized per-attempt when randomize_answers is true.

### assignments
- id (uuid, pk)
- title (text)
- instructions (text)
- submission_type (text, check in ('file_upload', 'text', 'url'))
- requires_review (boolean, default true)
- created_at, updated_at

### assignment_submissions
- id (uuid, pk)
- assignment_id (uuid, references assignments.id)
- lesson_id (uuid, references lessons.id) — the assignment lesson that wrapped this submission
- user_id (uuid, references profiles.id)
- submission_text (text, nullable)
- submission_url (text, nullable)
- submission_file_path (text, nullable) — Supabase Storage path
- status (text, check in ('submitted', 'approved', 'needs_revision'), default 'submitted')
- reviewer_notes (text, nullable)
- reviewed_by (uuid, nullable, references profiles.id)
- reviewed_at (timestamptz, nullable)
- submitted_at (timestamptz, default now())

### user_block_progress
Tracks completion of content blocks. Also used by the progress calculator for content lessons.
- id (uuid, pk)
- user_id (uuid, references profiles.id, on delete cascade)
- block_id (uuid, references content_blocks.id, on delete cascade)
- completed_at (timestamptz, default now())
- unique (user_id, block_id)

### user_lesson_completions
Derived but materialized for fast queries. Populated by trigger when the last required block/quiz attempt/submission for a lesson is satisfied.
- id (uuid, pk)
- user_id (uuid, references profiles.id, on delete cascade)
- lesson_id (uuid, references lessons.id, on delete cascade)
- completed_at (timestamptz, default now())
- unique (user_id, lesson_id)

### user_quiz_attempts
- id (uuid, pk)
- user_id (uuid, references profiles.id, on delete cascade)
- quiz_id (uuid, references quizzes.id, on delete cascade)
- lesson_id (uuid, references lessons.id) — the quiz lesson that wrapped this attempt
- score (integer) — percent 0 to 100
- passed (boolean)
- question_order (jsonb) — array of question ids in the order served this attempt
- answer_orders (jsonb) — object mapping question_id to array of answer_option_ids in the order served
- responses (jsonb) — object mapping question_id to array of selected answer_option_ids
- started_at (timestamptz, default now())
- completed_at (timestamptz, nullable)

### user_course_resume
- user_id (uuid, references profiles.id, on delete cascade)
- course_id (uuid, references courses.id, on delete cascade)
- last_lesson_id (uuid, references lessons.id)
- last_block_id (uuid, nullable, references content_blocks.id) — for scroll-to-block resume within a content lesson
- updated_at (timestamptz, default now())
- primary key (user_id, course_id)

### certificates
Per-course certificates.
- id (uuid, pk)
- user_id (uuid, references profiles.id)
- course_id (uuid, references courses.id)
- issued_at (timestamptz, default now())
- pdf_path (text) — Supabase Storage path
- certificate_number (text, unique) — human readable, e.g. BMH-C-2026-0001
- unique (user_id, course_id)

### program_certificates
Per-program certificates.
- id (uuid, pk)
- user_id (uuid, references profiles.id)
- program_id (uuid, references programs.id)
- issued_at (timestamptz, default now())
- pdf_path (text)
- certificate_number (text, unique) — e.g. BMH-P-2026-0001
- unique (user_id, program_id)

### certificate_templates
Per-course or per-program branding.
- id (uuid, pk)
- name (text)
- scope (text, check in ('course', 'program'), default 'course')
- background_image_path (text, nullable)
- body_html (text) — merge fields: `{{full_name}}`, `{{title}}`, `{{completion_date}}`, `{{certificate_number}}`
- created_at, updated_at

### invites
- id (uuid, pk)
- email (text)
- role_group_ids (uuid array) — groups to assign on acceptance
- system_role (text, default 'learner')
- token (text, unique) — secure random
- invited_by (uuid, references profiles.id)
- accepted_at (timestamptz, nullable)
- expires_at (timestamptz, default now() + interval '14 days')
- created_at

### audit_log
- id (uuid, pk)
- user_id (uuid, nullable, references profiles.id)
- action (text) — e.g. 'lesson_completed', 'quiz_passed', 'course_certificate_issued', 'program_certificate_issued', 'user_invited', 'assignment_approved'
- entity_type (text)
- entity_id (uuid)
- metadata (jsonb)
- created_at

## Row Level Security Policies

Enable RLS on every table. Core rules:

**profiles**: users can read their own row and rows of users sharing any role group. Owners and admins can read and update all rows.

**programs, courses, modules, lessons, content_blocks**: learners can read a row only if it is published AND a role_group they belong to has access (via program_access on a program containing the course, or via course_access on the course directly). Writes restricted to owner/admin.

**quizzes, questions, answer_options, assignments**: read allowed to learners who have access to any lesson referencing them. Writes restricted to owner/admin.

**user_block_progress, user_lesson_completions, user_quiz_attempts, user_course_resume**: users can insert and select their own rows. Owners and admins can select all.

**assignment_submissions**: learners can insert and select their own. Owners and admins can select all and update status/reviewer_notes/reviewed_by/reviewed_at.

**certificates, program_certificates**: users can select their own. Owners and admins can select all.

**role_groups, user_role_groups, program_access, course_access, invites, certificate_templates, program_courses**: read restricted to owner/admin (users see their own via role hooks). Writes restricted to owner/admin.

## Key Server-Side Functions (Postgres)

### fn_user_has_course_access(user_id uuid, course_id uuid) returns boolean
True if the user is owner/admin OR has a role_group with course_access OR has a role_group with program_access on any program containing the course.

### fn_user_has_program_access(user_id uuid, program_id uuid) returns boolean
True if the user is owner/admin OR has a role_group with program_access on this program.

### fn_lesson_is_unlocked(user_id uuid, lesson_id uuid) returns boolean
True if no prerequisite, OR the prerequisite lesson is completed (per user_lesson_completions), AND if prerequisite_quiz_min_score is set, the user's best attempt on the prerequisite's quiz meets that score. Also enforces course-level sequential lock when applicable: if the containing course is part of a sequential program, prior courses in that program must be 100% complete.

### fn_course_completion_percent(user_id uuid, course_id uuid) returns integer
Count of required lessons completed / total required lessons * 100.

### fn_program_completion_percent(user_id uuid, program_id uuid) returns integer
Count of required courses completed (all required lessons completed in each) / total courses in program * 100.

### fn_issue_course_certificate_if_eligible(user_id uuid, course_id uuid)
If course is 100% complete and certificate_enabled, generates certificate_number, calls the generate-certificate edge function, inserts certificates row. Idempotent via unique constraint.

### fn_issue_program_certificate_if_eligible(user_id uuid, program_id uuid)
Same for programs. Fires when every course in the program has a certificate row for this user.

### Triggers
- After insert on user_block_progress, user_quiz_attempts (where passed = true), and assignment_submissions (on status → approved):
  1. Check if lesson is complete; if so, insert into user_lesson_completions.
  2. Update user_course_resume.
  3. Call fn_issue_course_certificate_if_eligible for the affected course.
  4. Call fn_issue_program_certificate_if_eligible for every program containing that course.
- After update on answer_options, questions, quizzes, assignments: bump updated_at on parent lesson.

## Frontend Routes

All routes live in the Next.js App Router under `src/app/`. Public routes live outside any auth group; learner and admin routes live under `(dashboard)`.

**Public (`src/app/(auth)/*` and auth callback handlers):**
- /login
- /invite/[token] (accept invite, set password, create profile)
- /forgot-password
- /reset-password

**Learner (default):**
- /dashboard — list of assigned Programs and standalone Courses with progress bars; resume card for most-recent activity
- /programs/:programId — overview of the program with its Courses listed (locked/unlocked per sequential rules)
- /courses/:courseId — course overview with module and lesson tree, lock icons, progress
- /lessons/:lessonId — lesson page (content blocks OR quiz runner OR assignment view) with sidebar curriculum tree
- /certificates — list of earned course and program certificates with download buttons
- /profile — edit name, avatar, password

**Admin (owner/admin):**
- /admin — dashboard with team progress heatmap and activity feed
- /admin/programs — list, create, edit, publish; assign courses and order; assign role groups
- /admin/programs/:programId/edit — drag to reorder courses, set course_order_mode, manage program_access
- /admin/courses — list, create, edit, publish; assign to programs; assign role groups
- /admin/courses/:courseId/edit — drag to reorder modules and lessons; set prerequisites
- /admin/lessons/:lessonId/edit — for content lessons: drag to reorder content_blocks, add/remove blocks, edit per-block settings
- /admin/quizzes/:quizId/edit — drag to reorder questions and options; configure randomization, passing score, retakes
- /admin/assignments/:assignmentId/edit — instructions, submission type, reviewer settings
- /admin/users — list members, invite new, assign system_role and role_groups, suspend
- /admin/role-groups — CRUD role groups
- /admin/submissions — pending assignment reviews with approve/request-revision flow
- /admin/reports — per-program, per-course, per-user, per-quiz breakdowns
- /admin/certificates — manage certificate templates for course and program scopes
- /admin/audit — activity feed

## Drag and Drop (@dnd-kit)

Reordering is drag-and-drop at every level:
- Courses within a Program (uses program_courses.sort_order)
- Modules within a Course
- Lessons within a Module
- Content blocks within a content Lesson
- Questions within a Quiz
- Answer options within a Question

Each drop persists the new order via a batch update RPC that updates all affected sort_order values in a single transaction.

## Key UI Components

**SidebarCurriculum** — left-side nav on any lesson page. Renders Program/Course/Module/Lesson tree for the current course with lock icons, completion checkmarks, and active highlight. Clickable entries deep-link to lessons.

**LessonGate** — wraps any lesson route. Calls fn_lesson_is_unlocked. If locked, shows "Complete [prerequisite title] to unlock this lesson" with a back link.

**LessonRenderer** — for content lessons. Renders content_blocks in sort_order, each through its registered block component. Fires RPC to insert user_block_progress when a block reports completion. Tracks scroll position for resume.

**Block components** — one per block_type: VideoBlock, TextBlock, PdfBlock, ImageBlock, AudioBlock, DownloadBlock, ExternalLinkBlock, EmbedBlock, DividerBlock, CalloutBlock. Each defines its own completion trigger (90% play, scroll to end, click, manual).

**VideoBlock** — provider-aware. For source='upload', plays via HTML5 `<video>` tag from a Supabase Storage signed URL. For source in ('youtube','vimeo','loom'), embeds via iframe with privacy params (YouTube: youtube-nocookie.com; Vimeo: dnt=1). Exposes: playback speed, resume position, fullscreen, 90% completion event.

**LessonEditor** (admin) — for content lessons. @dnd-kit column of content blocks with "Add block" menu. Clicking a block opens a side drawer with fields specific to its type. File uploads go through the upload-content-file edge function.

**QuizRunner** — handles the full attempt flow. On mount, creates a user_quiz_attempts row with question_order and answer_orders computed from the quiz's randomization settings. Persists responses jsonb on each answered question so a mid-quiz refresh restores state. On submit, calls score-quiz-attempt RPC server-side so scoring is tamper-proof. Shows pass or fail screen with retake button respecting cooldown and max_attempts.

**AssignmentRunner** — shows instructions; renders a submission form per submission_type (file upload, text, URL). On submit, inserts assignment_submissions and notifies admins.

**AdminProgressTable** — heatmap. Users as rows, courses (or programs) as columns; cells show percent complete with color thresholds (red under 25, yellow 25 to 75, green above). Click a cell for drilldown.

**CertificateViewer** — inline PDF viewer with download and share-link actions.

## Edge Functions (Supabase)

**upload-content-file** — accepts multipart upload, streams to Supabase Storage with resumable support, returns the storage path. Used by video, pdf, image, audio, download blocks and assignment submissions.

**generate-certificate** — given user_id + (course_id OR program_id) + template_id, renders the template HTML with merge fields, converts to PDF, uploads to Storage, returns path. Called from fn_issue_*_certificate_if_eligible.

**score-quiz-attempt** — called by QuizRunner on submit. Reads responses jsonb, compares to correct answers, writes score + passed on user_quiz_attempts, fires lesson-completion trigger.

**send-invite-email** — called when an invites row is created. Sends email via Resend or Postmark with the /invite/:token link.

**send-assignment-notification** — notifies admins when a submission is created, and the learner when a submission is approved or needs revision.

## Invite Flow

1. Admin enters email in /admin/users, selects role_groups and optional system_role, clicks Invite.
2. invites row is created; send-invite-email edge function fires.
3. Recipient clicks link; lands on /invite/:token.
4. Token validated (not expired, not accepted). Email pre-filled, read-only.
5. User sets password; Supabase auth.users row created; profile row created (status = 'active'); user_role_groups rows created; invites.accepted_at set.
6. Redirect to /dashboard.

## Development Workflow

**Test-Driven Development (TDD) is the standard.** For every feature and bug fix:

1. Write a failing test that captures the desired behavior.
2. Write the minimum code to make it pass.
3. Refactor with tests green.

Test tooling mirrors Sandra CRM:
- **Vitest** for unit tests and integration tests (separate configs — `vitest.config.ts` and `vitest.integration.config.ts`).
- **Playwright** for end-to-end browser tests.
- **Integration tests** run against a real Supabase project (`sandra-crm-test` has a counterpart pattern; BMH Institute may reuse `bmh-institute` dev or spin up a dedicated test project once traffic warrants).
- **No work is "done"** until tests are green and new behavior has a covering test.
- Migrations get a test that asserts the migration applies and RLS behaves as specified.

`npm run verify` (typecheck + tests) gates pre-push. Husky hooks enforce lint + format on commit.

## Build Phases

**Phase 1 — Foundation**
- Initialize Next.js 16 + TypeScript project mirroring Sandra CRM structure.
- Install deps (React 19, Tailwind 4, shadcn v4, Base UI, @supabase/ssr, @dnd-kit, Vitest, Playwright, Husky, ESLint).
- Configure Tailwind theme, shadcn registry, ESLint, Husky pre-commit.
- Set up Vitest unit + integration configs and Playwright config.
- Apply all 5 Supabase migrations (001 through 005).
- Storage buckets: `content` (videos, pdfs, images, audio, downloads), `submissions`, `certificates`, `avatars`.
- Wire `@supabase/ssr` client/server/middleware helpers.
- Write failing smoke tests: root layout renders, /login renders, middleware redirects unauth to /login.
- Implement: root layout, middleware, /login page, /invite/[token] page, /forgot-password page.
- Green tests, verify, commit.

**Phase 2 — Admin authoring for content**
- Program, Course, Module CRUD with drag-and-drop ordering.
- Lesson CRUD (type = content) with drag-and-drop ordering.
- ContentBlocks CRUD with drag-and-drop and per-type editor drawers.
- upload-content-file edge function.

**Phase 3 — Learner experience for content lessons**
- Dashboard listing assigned programs and courses.
- Program and course overview pages.
- LessonRenderer with all block components.
- SidebarCurriculum.
- user_block_progress tracking; user_lesson_completions trigger.
- Resume-where-you-left-off.

**Phase 4 — Quizzes**
- Quiz, Question, AnswerOption CRUD with drag-and-drop.
- Quiz lesson type wiring.
- QuizRunner with randomization, retakes, cooldowns.
- score-quiz-attempt edge function.
- Prerequisite unlock including prerequisite_quiz_min_score.

**Phase 5 — Assignments**
- Assignment CRUD.
- Assignment lesson type wiring.
- AssignmentRunner with file/text/URL submission.
- Reviewer queue at /admin/submissions.
- send-assignment-notification edge function.

**Phase 6 — Access control**
- Role Groups CRUD.
- Program and Course access assignment UIs.
- Invite flow end-to-end.
- RLS policies finalized and tested.

**Phase 7 — Certificates and reporting**
- Certificate templates (course and program scopes).
- generate-certificate edge function.
- Course and program certificate issuance triggers.
- Admin progress heatmap, per-user/course/program/quiz reports, audit log feed.

## Environment Variables

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (edge functions only)
- SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS — Google Workspace SMTP
- SMTP_FROM_EMAIL / SMTP_FROM_NAME — sender identity
- VITE_APP_URL (used in invite and notification emails)

## Seed Data for Testing

- 1 owner profile (Jarrad)
- 3 role groups: "Appointment Setters", "Lead Managers", "Acquisitions"
- 1 sample Program "Appointment Setter Onboarding" (course_order_mode = sequential) containing 2 courses
- Sample Course "Phone Basics" with 2 modules:
  - Module 1 with 2 Lessons: one content lesson (video block + text block + download block), one quiz lesson
  - Module 2 with 1 assignment lesson
- 1 sample Quiz with 2 true_false, 2 single_choice, 1 multi_select questions, passing_score = 80
- program_access entry granting "Appointment Setters" access to the program

## Notes and Guardrails

- All scoring and access checks run server-side via RPC or RLS. Never trust client-calculated scores or client-filtered lists.
- Signed URLs for Supabase Storage content; never serve raw public URLs for learner content.
- Video files should be encoded as MP4 (H.264) before upload for best cross-device playback. Max 2 GB per file matches Thinkific's cap; configurable in Storage settings.
- Lessons open on their own page (own route), not as modals.
- Answer options are rendered without letter prefixes (A, B, C); positions randomized per-attempt when randomize_answers is true.
- No em dashes in UI copy or seeded content. Minimal commas, dashes, hyphens.
- No bold or Roman numeral headers in any admin or learner copy.
- Company name is "BMH Group" (never "BMH Group KC").
- Contract documents default to PDF.
- Admin UI is functional, not fancy — internal tool.
- No HTML `<form>` tags; use onClick handlers (carries a prior-project preference).
