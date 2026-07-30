-- One-shot insertion of the 2 remaining Andrea Oral Check blocks: a
-- role_play block (content.mode = 'oral_check') appended after the existing
-- flashcard block in each of Objection Architecture and Objection Scripts
-- Playbook (lesson-content-slot-09 and lesson-content-slot-10, both in
-- module 4 "Objections and Questions"), bound to 2 real, live Closer Lab
-- scenario IDs.
--
-- Why these two and why now: the 3-lesson pilot (20260728020000) and the
-- 9-lesson expansion (20260729060000) between them covered 12 of the 19
-- instructional lessons. Of the remaining 7, five (lesson-content-slot-07,
-- -08, -11, -13, -18) already carry a certification role_play block bound
-- to a real section assignment, so 17 of 19 lessons had some form of spoken
-- assessment. These two were simply missed: they have no oral check, no
-- certification role play, and no assessment of any kind. This closes that
-- gap, and nothing else.
--
-- Learner impact, checked against live production immediately before this
-- migration was authored: both new blocks are is_required_for_completion =
-- true (matching all 12 existing oral-check blocks), and every learner-facing
-- completion read recomputes lesson completion from the live set of required
-- blocks rather than from the durable user_lesson_completions row. So adding
-- a required block to a lesson someone had already finished would visibly
-- un-complete it for them (progress bar, "continue learning" target, and the
-- gated Guide part), even though no durable completion row or issued
-- certificate is ever destroyed. That is not a risk here: production
-- currently holds ZERO user_lesson_completions rows for either target lesson
-- and ZERO issued certificates overall, verified read-only via Supabase MCP
-- the same session this was written. No backfill is therefore needed or
-- shipped. If either count is ever non-zero at apply time, stop and backfill
-- user_block_progress for the affected learners in the same transaction
-- instead of applying this as-is.
--
-- Mirrors 20260729060000_insert_oral_check_expansion_role_play_blocks.sql's
-- pattern exactly, scaled from 9 blocks to 2 -- hash-pinned CAS against the
-- exact production state, marker-gated insert-only guard, one immutable
-- evidence row. Deliberately not a general, reusable mechanism (single
-- operator, off-hours, no concurrent admin edits in scope) and deliberately
-- not a row in any of the existing exact-count-guarded evidence tables (the
-- pilot's is hard-pinned to 3, the expansion's to 9, the released-content-
-- block-revision table to a different, unrelated shape) -- this defines a
-- fourth, parallel evidence table sized for this one operation (2 inserts,
-- 0 updates) instead.
--
-- Closer Lab side is already fully built and live: both role_plays, their
-- personas, and their 4-goal rubrics each exist in project
-- xqrkugdxpwhjscrheuqo with archived_at is null -- verified read-only
-- against production immediately before authoring this migration
-- (managed_source_key bmh-institute-oral-checks-v1:role-play:objection-
-- architecture and :objection-scripts-playbook). This migration only ever
-- touches Institute's own content_blocks; it does not write to Closer Lab.
--
-- Content is the Jarrad-approved rollout copy (context / learner_goal /
-- success_criteria / fail_conditions per lesson). Both blocks carry 4
-- success_criteria and 3 fail_conditions. That 3-item fail_conditions floor
-- is deliberate and load-bearing: 20260729062000_fix_oral_check_expansion_
-- fail_conditions_min_length.sql exists solely because three of the nine
-- expansion blocks shipped with 1-2 fail_conditions and
-- src/lib/course-import/manifest.ts's validateCourseManifest requires 3-8
-- non-empty strings for BOTH success_criteria and fail_conditions. CI
-- caught that only after the direct-to-production apply. These two blocks
-- satisfy the 3-8 rule on both arrays from the start, so no follow-up
-- correction migration is needed and none should ever be written.
--
-- Naming note: this operation's object names deliberately drop the
-- 'content_import_' / 'role_play' padding on the rollback table, guard
-- functions, and triggers that the expansion used. 'objections' is one
-- character longer than 'expansion', which pushed several of the
-- mechanically-derived names past PostgreSQL's 63-byte identifier limit
-- where they would have been silently truncated. Explicit short names are
-- unambiguous in the migration, in the tests, and in psql; silently
-- truncated ones are not. Semantics are identical to the expansion's.
--
-- Hash-pin provenance: production project dhvfsyteqsxagokoerrx,
-- read-only-verified via select public.fn_course_import_catalog_sha256(
-- 'bmh-employee-training-v1') immediately before this migration was
-- authored. If production drifts before this migration is applied (e.g. any
-- admin edit lands in the meantime, including the pilot's or the
-- expansion's own rollback being invoked), the preflight check below fails
-- closed with the live hash in the error message -- re-derive
-- v_expected_prior_catalog_sha256 from that value and re-author before
-- retrying. Never loosen the check to work around a mismatch.
--
-- Deployment sequencing mirrors the pilot and the expansion exactly: this
-- file only installs the evidence table, its guard, the extended
-- imported-content-block insert guard, and the insert function -- it does
-- not self-invoke. The rollback capability (20260730060500) must exist
-- before the actual forward invocation (20260730061000) is allowed to run
-- at all -- enforced both by that later migration's own preflight AND by an
-- identical assertion inside
-- fn_insert_oral_check_objections_role_play_blocks() itself, so no call
-- path (the apply migration's wrapper, a direct RPC, anything) can mutate
-- the catalog without a prepared rollback path already installed.

set lock_timeout = '10s';

create table public.content_import_oral_check_objections_role_play_records (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  role_play_insert_count integer not null check (role_play_insert_count = 2),
  mutations jsonb not null check (jsonb_typeof(mutations) = 'array' and jsonb_array_length(mutations) = 2),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  revised_at timestamptz not null default now(),
  revised_by uuid,
  primary key (import_id)
);

comment on table public.content_import_oral_check_objections_role_play_records is
  'Immutable audit evidence for the one-shot Andrea Oral Check objections insertion (2 blocks, 2 lessons: Objection Architecture and Objection Scripts Playbook). Exact-count guarded like content_import_oral_check_pilot_role_play_records and content_import_oral_check_expansion_role_play_records, but sized for this single operation -- never reused for a second correction. This is a genuinely ONE-SHOT operation: a second invocation of fn_insert_oral_check_objections_role_play_blocks always refuses once a row exists here, regardless of live catalog state -- see that function''s comment.';

alter table public.content_import_oral_check_objections_role_play_records enable row level security;

-- Every public RLS table in Institute must carry the Hugo restrictive
-- active-access gate. 20260728230000_hugo_access_authorization_hardening.sql
-- installed it across every public RLS table that existed then, and
-- 20260729140000_hugo_refresh_active_access_gates.sql re-ran that sweep for
-- tables added since. Neither can reach a table created by a LATER migration,
-- so this one installs its own gate at creation time -- the same thing
-- 20260729141000_hugo_post_merge_security_closure.sql does for a single
-- table. Belt and braces on top of the revokes below (authenticated holds no
-- privilege on this table at all), and the invariant
-- supabase/tests/057_hugo_access_authorization_hardening.sql asserts.
drop policy if exists hugo_active_authenticated_gate
  on public.content_import_oral_check_objections_role_play_records;
create policy hugo_active_authenticated_gate
  on public.content_import_oral_check_objections_role_play_records
  as restrictive
  for all
  to authenticated
  using ((select public.fn_hugo_access_is_active(auth.uid())))
  with check ((select public.fn_hugo_access_is_active(auth.uid())));

revoke all on table public.content_import_oral_check_objections_role_play_records
from public, anon, authenticated;
grant select on table public.content_import_oral_check_objections_role_play_records
to service_role;

create or replace function public.fn_guard_oral_check_objections_role_play_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.oral_check_objections_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.oral_check_objections_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Oral-check objections role-play insertion records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_oral_check_objections_role_play_record()
from public, anon, authenticated;

create trigger oral_check_objections_role_play_records_guard
before insert or update or delete on public.content_import_oral_check_objections_role_play_records
for each row execute function public.fn_guard_oral_check_objections_role_play_record();

-- Extend the existing imported-content-block insert guard with ONE new
-- exact-hash branch for this operation, alongside the untouched original
-- apply-marker, 44-block-correction, oral-check-pilot, and
-- oral-check-expansion branches (migrations 033, 20260726170000,
-- 20260728020000, 20260729060000). This function's other four branches are
-- copied verbatim, unchanged -- the body below was produced by taking
-- 20260729060000's definition (confirmed byte-identical to the live
-- production function body via md5(prosrc) before this migration was
-- written) and adding exactly one branch plus its two declarations.
create or replace function public.fn_guard_imported_content_block_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_course_published boolean;
  v_program_published boolean;
  v_apply_import_id text :=
    coalesce(current_setting('bmh.apply_import_id', true), '');
  v_revision_import_id text :=
    coalesce(current_setting('bmh.revise_content_blocks_import_id', true), '');
  v_revision_payload_sha256 text :=
    coalesce(current_setting('bmh.revise_content_blocks_payload_sha256', true), '');
  v_oral_check_pilot_import_id text :=
    coalesce(current_setting('bmh.oral_check_pilot_import_id', true), '');
  v_oral_check_pilot_payload_sha256 text :=
    coalesce(current_setting('bmh.oral_check_pilot_payload_sha256', true), '');
  v_oral_check_expansion_import_id text :=
    coalesce(current_setting('bmh.oral_check_expansion_import_id', true), '');
  v_oral_check_expansion_payload_sha256 text :=
    coalesce(current_setting('bmh.oral_check_expansion_payload_sha256', true), '');
  v_oral_check_objections_import_id text :=
    coalesce(current_setting('bmh.oral_check_objections_import_id', true), '');
  v_oral_check_objections_payload_sha256 text :=
    coalesce(current_setting('bmh.oral_check_objections_payload_sha256', true), '');
begin
  select
    coalesce(lesson.content_import_id, course.content_import_id),
    course.is_published,
    program.is_published
  into v_import_id, v_course_published, v_program_published
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  left join public.program_courses membership on membership.course_id = course.id
  left join public.programs program on program.id = membership.program_id
  where lesson.id = new.lesson_id;

  if v_import_id is null then return new; end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_apply_import_id = v_import_id
  then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_import_id = 'bmh-employee-training-v1'
    and v_revision_import_id = v_import_id
    and v_revision_payload_sha256 =
      '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.program_id = (
          select membership.program_id
          from public.program_courses membership
          where membership.course_id = (
            select module.course_id
            from public.lessons lesson
            join public.modules module on module.id = lesson.module_id
            where lesson.id = new.lesson_id
          )
        )
        and release.manifest_sha256 =
          '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    )
  then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_import_id = 'bmh-employee-training-v1'
    and v_oral_check_pilot_import_id = v_import_id
    and v_oral_check_pilot_payload_sha256 =
      '893405d59d508783cbb96bb543ab41080337fa6aa06f92a106c10962c5fcfce5'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.manifest_sha256 =
          '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    )
  then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_import_id = 'bmh-employee-training-v1'
    and v_oral_check_expansion_import_id = v_import_id
    and v_oral_check_expansion_payload_sha256 =
      '08ffb8c5c0431b482cffaa8871cf6adf1e016b7b6f9568617ec544356dadab7e'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.manifest_sha256 =
          '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    )
  then
    return new;
  end if;
  -- Deliberately TIGHTER than the three hash-pinned branches above it: those
  -- accept any block id, into any lesson of the import, for as long as the
  -- branch exists, because their session markers and payload hashes are
  -- public literals visible in this file and in pg_proc.prosrc. This branch
  -- additionally fences new.id to exactly the 2 block ids this one-shot
  -- operation is allowed to create, so the marker pair is not a permanent
  -- general-purpose insert capability over the whole released catalog. The
  -- earlier branches are left untouched (byte-identical) rather than
  -- retrofitted here -- narrowing a live capability that other shipped
  -- operations already depend on is its own change, with its own blast
  -- radius, and does not belong in this migration.
  if coalesce(auth.role(), '') = 'service_role'
    and v_import_id = 'bmh-employee-training-v1'
    and v_oral_check_objections_import_id = v_import_id
    and v_oral_check_objections_payload_sha256 =
      '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016'
    and new.id = any(array[
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    ]::uuid[])
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.manifest_sha256 =
          '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    )
  then
    return new;
  end if;
  raise exception 'Imported content blocks may only be created by the exact apply or released content revision operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_content_block_insert_v1()
from public, anon, authenticated;

create or replace function public.fn_insert_oral_check_objections_role_play_blocks()
returns jsonb
language plpgsql
security definer
set search_path = ''
-- Function-level override so a real invocation cannot hang indefinitely
-- behind a busy writer while holding a 15-table lock set. Postgres's session
-- default is 0 (wait forever), and the migration-level SET at the top of this
-- file only applies to the session that installs the migration, not a later
-- invoking session -- including the apply migration's own session when
-- 20260730061000 is applied on its own in a resumed push. Mirrors the
-- function-level override the rollback function carries for the same reason.
set lock_timeout = '10s'
as $$
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  -- Read-only-verified against production immediately before this migration
  -- was authored. If this no longer matches the live catalog when this
  -- migration is applied, the preflight check below aborts with both values
  -- in the error message; re-derive and re-author, never loosen.
  v_expected_prior_catalog_sha256 constant text :=
    '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95';
  v_mutations jsonb;
  v_database_payload_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_inserted_count integer;
  v_target_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Oral-check objections role-play insertion requires service_role.'
      using errcode = '42501';
  end if;

  -- This function must never mutate the catalog without a prepared rollback
  -- path already in place -- mirrors the pilot's and the expansion's own
  -- in-body assertions (20260728020000, 20260729060000), which fire
  -- regardless of who can call this function or when. Defense in depth:
  -- EXECUTE is also deliberately deferred to 20260730060500, after the
  -- rollback capability that check requires has actually been installed --
  -- see this migration's tail.
  if to_regclass('public.content_import_oral_check_objections_rollback_records') is null
    or to_regprocedure('public.fn_rollback_oral_check_objections_role_play_blocks()') is null
  then
    raise exception 'Oral-check objections role-play insertion refused: the rollback capability (content_import_oral_check_objections_rollback_records / fn_rollback_oral_check_objections_role_play_blocks) is not installed. This function must never mutate the catalog without a prepared rollback path already in place.'
      using errcode = '55000';
  end if;

  -- Genuinely ONE-SHOT, mirroring the pilot's and the expansion's own
  -- philosophy exactly: once an evidence row exists, refuse every
  -- subsequent invocation outright. Never re-verify and report success --
  -- query content_import_oral_check_objections_role_play_records directly
  -- to check whether this already happened.
  if exists (
    select 1 from public.content_import_oral_check_objections_role_play_records
    where import_id = v_import_id
  ) then
    raise exception 'Oral-check objections role-play insertion refused: this one-shot operation has already been performed for %. There is nothing to retry or re-verify by calling this function again -- query content_import_oral_check_objections_role_play_records directly.',
      v_import_id
      using errcode = '40001';
  end if;

  -- The exact 2-block mutation payload, built inline -- same shape as the
  -- pilot's 3 and the expansion's 9 (assignment_source_key, context,
  -- learner_goal, success_criteria, fail_conditions). block_ids use the
  -- SAME deterministic scheme the manifest importer uses
  -- (deterministicImportId in src/lib/course-import/operations.ts:
  -- sha256(import_id || ':' || source_key), first 32 hex chars, version and
  -- variant nibbles forced to 5/a), recomputed with that exact algorithm
  -- and confirmed to reproduce the pilot's and the expansion's own known
  -- block_ids before being used for these 2. scenario_id values are the
  -- real, live, persona- and rubric-goal-backed Closer Lab role_play IDs
  -- (verified read-only against project xqrkugdxpwhjscrheuqo,
  -- non-archived). content.title is deliberately omitted on both, matching
  -- the pilot and the expansion: content-blocks.tsx's "Talk with Andrea"
  -- render-time fallback already supplies it whenever content.mode =
  -- 'oral_check' and no explicit title is set. sort_order 6 on both is the
  -- first free slot: each target lesson holds exactly 5 blocks today
  -- (1 text, 2 video, 3 text, 4 download, 5 flashcard).
  v_mutations := jsonb_build_array(
    jsonb_build_object(
      'block_id', 'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'lesson_id', '25973272-2cfc-5357-ae82-18ed08db636b',
      'source_key', 'block-oral-check-slot-09',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', 'c3642915-deab-4b3d-9479-0fc71afee9e6',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-09',
          'context', 'This lesson covers why an objection is a good sign, the difference between a real objection and silence, venting, or a reactionary brush-off, and the listen-acknowledge-ask-redirect framework. Andrea checks it out loud with real seller moments -- a frustrated seller, a sudden silence, a price pushback -- because recognizing what''s actually happening on the call matters more than reciting the framework.',
          'learner_goal', 'Demonstrate you can recognize what''s really happening when a seller pushes back and respond the right way, in your own words.',
          'success_criteria', jsonb_build_array(
            'Explains why an objection signals engagement, not rejection',
            'Recognizes venting for what it is and responds with empathy plus redirect',
            'Holds the silence instead of rambling',
            'Handles a real objection framework-style: acknowledges and asks before defending'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses venting or silence with a real objection, or argues back instead of acknowledging',
            'Fills a silence with rambling instead of holding it',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', 'da8b819a-401d-5a9e-a7d9-ad237d128f0c',
      'lesson_id', '29ab8578-76cb-5fe2-ab68-b9e097e570ed',
      'source_key', 'block-oral-check-slot-10',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', 'c164bec1-fb24-46c7-8790-7ea3bf2fb7fb',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-10',
          'context', 'This lesson drills thirty real objection-to-comeback scripts. Andrea checks it out loud because the point was never memorizing all thirty -- it''s the pattern: get the seller''s number before giving ours, and use terms to close a gap cash alone can''t. Andrea has the learner pick any drilled objection and deliver their own comeback.',
          'learner_goal', 'Show the pattern behind the scripts, not a recitation of them, in your own words -- including one full comeback of your choosing.',
          'success_criteria', jsonb_build_array(
            'Understands the expectation is framework and reps, not memorized scripts',
            'Explains why we never give our number first',
            'Sees terms as the path past a cash-price gap',
            'Delivers a framework-shaped comeback to a chosen objection in their own words'
          ),
          'fail_conditions', jsonb_build_array(
            'Believes all thirty scripts need to be memorized word for word',
            'Would give a number before getting the seller''s number',
            'Gives no grounded answer, or a comeback that argues instead of acknowledging and asking'
          )
        )
      )
    )
  );

  v_database_payload_sha256 := encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex');

  -- Same widened lock set the pilot and the expansion use -- every table
  -- fn_course_import_catalog_sha256 reads, taken before the first read, so
  -- both reads and the insert observe one writer-excluded state the receipt
  -- provably matches. Kept in the same relative order as this migration's
  -- rollback lock set so the two operations can never deadlock against each
  -- other, and matches the expansion's own lock set exactly (same tables,
  -- same checksum function).
  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || v_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_oral_check_objections_role_play_records,
    public.programs,
    public.courses,
    public.program_courses,
    public.program_access,
    public.course_access,
    public.role_groups,
    public.modules,
    public.lessons,
    public.content_blocks,
    public.quizzes,
    public.questions,
    public.answer_options,
    public.assignments
  in share row exclusive mode;

  -- Re-check the one-shot evidence row now that the advisory lock is held.
  -- The check above runs on this transaction's pre-lock snapshot, so two
  -- genuinely concurrent invocations could both pass it and only then
  -- serialize here. Without this second read the loser would surface an
  -- opaque unique-violation (23505) from the content_blocks primary key or
  -- the evidence primary key instead of this operation's own clear,
  -- intentional refusal. Both outcomes are safe -- nothing double-inserts
  -- either way -- but only one of them is diagnosable at 3am.
  if exists (
    select 1 from public.content_import_oral_check_objections_role_play_records
    where import_id = v_import_id
  ) then
    raise exception 'Oral-check objections role-play insertion refused: this one-shot operation has already been performed for %. There is nothing to retry or re-verify by calling this function again -- query content_import_oral_check_objections_role_play_records directly.',
      v_import_id
      using errcode = '40001';
  end if;

  -- Confirm the exact published release lineage exists FIRST -- a fast,
  -- clear failure on any database that has never released this import at
  -- all (including every fresh local test database), before paying for the
  -- full catalog hash below.
  if not exists (
    select 1
    from public.content_import_release_records release
    where release.import_id = v_import_id
      and exists (
        select 1 from public.programs program
        where program.id = release.program_id and program.is_published
      )
  ) or exists (
    select 1
    from public.courses course
    where course.content_import_id = v_import_id and not course.is_published
  ) then
    raise exception 'Oral-check objections role-play insertion refused: exact published release lineage was not found.'
      using errcode = '42501';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_prior_catalog_sha256 <> v_expected_prior_catalog_sha256 then
    raise exception 'Oral-check objections role-play insertion refused: catalog drifted from the exact production preflight (expected %, live %). Re-derive the hash pin against current production state before retrying.',
      v_expected_prior_catalog_sha256, v_prior_catalog_sha256
      using errcode = '40001';
  end if;

  perform set_config('bmh.oral_check_objections_import_id', v_import_id, true);
  perform set_config('bmh.oral_check_objections_payload_sha256', v_database_payload_sha256, true);

  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  )
  select
    (mutation.value ->> 'block_id')::uuid,
    (mutation.value ->> 'lesson_id')::uuid,
    'role_play',
    mutation.value -> 'content',
    (mutation.value ->> 'sort_order')::integer,
    true
  from jsonb_array_elements(v_mutations) mutation(value);
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> 2 then
    raise exception 'Oral-check objections role-play insertion refused: expected exactly 2 rows inserted.'
      using errcode = '40001';
  end if;

  select count(*) into v_target_count
  from jsonb_array_elements(v_mutations) mutation(value)
  join public.content_blocks block
    on block.id = (mutation.value ->> 'block_id')::uuid
   and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
   and block.block_type = 'role_play'
   and block.content = mutation.value -> 'content'
   and block.sort_order = (mutation.value ->> 'sort_order')::integer
   and block.is_required_for_completion = true;
  if v_target_count <> 2 then
    raise exception 'Oral-check objections role-play insertion refused: atomic target verification failed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Oral-check objections role-play insertion refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

  insert into public.content_import_oral_check_objections_role_play_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, role_play_insert_count, mutations, evidence, revised_by
  ) values (
    v_import_id, v_prior_catalog_sha256, v_replacement_catalog_sha256,
    v_database_payload_sha256, 2, v_mutations,
    jsonb_build_object(
      'operation', 'oral_check_objections_role_play_insert',
      'lesson_source_keys', jsonb_build_array(
        'lesson-content-slot-09', 'lesson-content-slot-10'
      )
    ),
    auth.uid()
  );

  perform set_config('bmh.oral_check_objections_import_id', '', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'inserted',
    'import_id', v_import_id,
    'role_play_insert_count', 2,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256
  );
end;
$$;

-- EXECUTE deliberately not granted to service_role here -- deferred to
-- 20260730060500_rollback_objection_oral_check_role_play_blocks.sql, after
-- the rollback capability this function's own in-body check requires has
-- actually been installed. Until that migration commits, no role can invoke
-- this function at all, not just "can invoke it but it refuses."
revoke all on function public.fn_insert_oral_check_objections_role_play_blocks()
from public, anon, authenticated, service_role;

-- This migration deliberately does not self-invoke
-- fn_insert_oral_check_objections_role_play_blocks() here, mirroring the
-- pilot's and the expansion's own reasoning exactly: Supabase applies each
-- migration file as its own transactional batch, so a self-invoking insert
-- in THIS file could commit the 2 live required blocks before a
-- later-numbered migration installing the rollback capability ever ran. The
-- actual forward invocation lives in
-- 20260730061000_apply_objection_oral_check_role_play_blocks.sql, numbered
-- after both this file and
-- 20260730060500_rollback_objection_oral_check_role_play_blocks.sql, and
-- asserts the rollback function and its evidence table actually exist
-- before invoking this one.
