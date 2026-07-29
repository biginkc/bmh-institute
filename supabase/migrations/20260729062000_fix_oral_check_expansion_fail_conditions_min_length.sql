-- Corrects 3 of the 9 Andrea Oral Check expansion blocks
-- (20260729060000_insert_oral_check_expansion_role_play_blocks.sql): their
-- fail_conditions arrays had 1-2 entries, but
-- src/lib/course-import/manifest.ts's validateCourseManifest requires 3-8
-- non-empty strings for both success_criteria and fail_conditions. Caught
-- by CI on PR #132 after this repo's direct-to-production apply, not
-- before it -- the manifest validator is not part of a pre-apply gate for
-- this one-shot direct-MCP deployment method (it validates
-- content/course-manifests/*.json, a separate static fixture from the
-- migration's inline v_mutations). All 3 blocks were freshly inserted
-- minutes earlier with zero learner activity possible in that window.
--
-- Welcome and Mindset (block-oral-check-slot-01) had 1 fail_condition;
-- Compensation Engine (block-oral-check-slot-17) and Career Growth Path
-- (block-oral-check-slot-19) had 2 each. Every other field (context,
-- learner_goal, success_criteria, scenario_id, height_px, mode) is
-- unchanged -- this migration only ever touches the fail_conditions array
-- on these exact 3 rows.
--
-- Unlike 20260729060000, this is a plain UPDATE, not an INSERT: no trigger
-- guards UPDATE OF content on public.content_blocks (only INSERT, DELETE,
-- and UPDATE OF lesson_id carry guards -- confirmed via pg_trigger before
-- writing this), so no fn_guard_imported_content_block_insert_v1 extension
-- is needed here. Still hash-pinned CAS, matching this migration family's
-- standard: verifies each row's exact current (wrong) content before
-- writing anything, and verifies the catalog hash actually advances after.
-- One-shot via the same evidence-table pattern as its siblings -- a second
-- invocation always refuses once a row exists here, regardless of live
-- catalog state.
--
-- No rollback function is shipped alongside this one. Unlike the pilot's
-- and the expansion's own insert (which create new required blocks that
-- would otherwise need a prepared undo), this migration only ever narrows
-- an already-wrong array back toward correctness on rows that already
-- exist with zero learner activity -- reversing it, if ever needed, is a
-- plain three-row UPDATE an operator can write by hand from this
-- migration's own evidence row (which records the exact prior content).

set lock_timeout = '10s';

create table public.content_import_oral_check_expansion_fail_conditions_fix_records (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  block_fix_count integer not null check (block_fix_count = 3),
  fixed_block_ids uuid[] not null check (array_length(fixed_block_ids, 1) = 3),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  fixed_at timestamptz not null default now(),
  fixed_by uuid,
  primary key (import_id)
);

comment on table public.content_import_oral_check_expansion_fail_conditions_fix_records is
  'Immutable audit evidence for the one-shot fail_conditions min-length correction on 3 of the 9 Andrea Oral Check expansion blocks. Records the exact prior content per row so a manual revert is always derivable from this table alone.';

alter table public.content_import_oral_check_expansion_fail_conditions_fix_records enable row level security;
revoke all on table public.content_import_oral_check_expansion_fail_conditions_fix_records
from public, anon, authenticated;
grant select on table public.content_import_oral_check_expansion_fail_conditions_fix_records
to service_role;

create or replace function public.fn_guard_content_import_oral_check_expansion_fail_conditions_fix_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.oral_check_expansion_fail_conditions_fix_import_id', true), '') <> new.import_id
  then
    raise exception 'Oral-check expansion fail_conditions fix records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_content_import_oral_check_expansion_fail_conditions_fix_record()
from public, anon, authenticated;

create trigger content_import_oral_check_expansion_fail_conditions_fix_records_guard
before insert or update or delete on public.content_import_oral_check_expansion_fail_conditions_fix_records
for each row execute function public.fn_guard_content_import_oral_check_expansion_fail_conditions_fix_record();

do $$
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  v_expected_prior_catalog_sha256 constant text :=
    '9ade09501bd07ea8471487150228a662ac2891cd3128b07a83a5dbd26a659597';
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_fixed_block_ids constant uuid[] := array[
    '4849582b-55e6-5c10-a853-1ba17cd44165',
    '852a2122-69b6-560d-af2d-b5ec57ffcb69',
    '30e2f23e-6e20-5d2b-aa63-59b6adf11d0f'
  ]::uuid[];
  v_expected_prior_content jsonb;
  v_updated_count integer;
  v_target_count integer;
  v_has_release boolean;
begin
  -- Mirrors 20260729061000_apply_oral_check_expansion_role_play_blocks.sql:
  -- the migration-runner session is not itself authenticated as
  -- service_role through PostgREST, so this self-invoking block claims it
  -- explicitly for its own duration, exactly like every other self-invoking
  -- migration in this family.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Oral-check expansion fail_conditions fix requires service_role.'
      using errcode = '42501';
  end if;

  -- Replay-safety, same shape as 20260729061000: a fresh database (CI's
  -- full migration replay, a local reset, a new preview project) has no
  -- bmh-employee-training-v1 release at all -- fn_course_import_catalog_sha256
  -- still returns a real (non-null) hash for a nonexistent import_id, so
  -- without this check the catalog-drift comparison below would raise on
  -- every fresh replay instead of skipping. On the real production target
  -- the release exists, so this branch is unreachable there.
  select exists (
    select 1 from public.content_import_release_records where import_id = v_import_id
  ) into v_has_release;
  if not v_has_release then
    raise notice 'Oral-check expansion fail_conditions fix skipped: no release exists for % on this database, so there is nothing for this one-shot correction to fix.', v_import_id;
    perform set_config('request.jwt.claim.role', '', true);
    return;
  end if;

  if exists (
    select 1 from public.content_import_oral_check_expansion_fail_conditions_fix_records
    where import_id = v_import_id
  ) then
    raise exception 'Oral-check expansion fail_conditions fix refused: this one-shot operation has already been performed for %.',
      v_import_id
      using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || v_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_oral_check_expansion_fail_conditions_fix_records,
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

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_prior_catalog_sha256 <> v_expected_prior_catalog_sha256 then
    raise exception 'Oral-check expansion fail_conditions fix refused: catalog drifted from the exact expected pre-fix state (expected %, live %). Re-derive before retrying.',
      v_expected_prior_catalog_sha256, v_prior_catalog_sha256
      using errcode = '40001';
  end if;

  -- CAS: each target row's content must exactly match what the original
  -- (buggy) insert wrote, byte-for-byte, before this migration touches it.
  v_expected_prior_content := jsonb_build_object(
    '4849582b-55e6-5c10-a853-1ba17cd44165', jsonb_build_object(
      'mode', 'oral_check', 'height_px', 760,
      'scenario_id', '7f02bec1-94d6-403f-9792-157238c75450',
      'scenario_spec', jsonb_build_object(
        'assignment_source_key', 'oral-check-slot-01',
        'context', 'This lesson is a casual first check-in -- what you think the company does, who you''ll be talking to, and what it means to be a guide instead of a salesman. Andrea isn''t grading you here -- there''s no wrong answer, she just wants to hear how it''s landing before you ever pick up a phone.',
        'learner_goal', 'Talk through what you''ve taken in so far, in your own words -- there''s no wrong answer.',
        'success_criteria', jsonb_build_array(
          'Describes what BMH does in their own words (buys houses for cash, as-is, from people who need speed and simplicity)',
          'Describes who the sellers are with some human framing (real people in tough spots, not just "homeowners")',
          'Puts the guide-not-salesman idea in their own words (helping people find their best path, not pushing for a yes)'
        ),
        'fail_conditions', jsonb_build_array(
          'Gives no grounded answer at all -- doesn''t engage or answers a completely different question'
        )
      )
    ),
    '852a2122-69b6-560d-af2d-b5ec57ffcb69', jsonb_build_object(
      'mode', 'oral_check', 'height_px', 760,
      'scenario_id', '148bc0c0-e42d-4b57-983b-4fc012f8dcf2',
      'scenario_spec', jsonb_build_object(
        'assignment_source_key', 'oral-check-slot-17',
        'context', 'This lesson is deliberately number-free -- how pay thinking works here and where the real answers live. Andrea checks it out loud because knowing WHERE to look matters more than memorizing a number that isn''t yours.',
        'learner_goal', 'Demonstrate you know where pay answers actually live and why plans differ by role, in your own words.',
        'success_criteria', jsonb_build_array(
          'Names the source of truth (your own written agreement and your manager) and rejects hallway sources like a teammate''s plan',
          'Explains why pay isn''t one formula for everyone (built around the value each role creates)',
          'Describes their own role and the value it creates, in their own words'
        ),
        'fail_conditions', jsonb_build_array(
          'Treats a teammate''s plan or hallway talk as an authoritative answer about their own pay',
          'Gives no grounded answer -- guesses or answers a different question'
        )
      )
    ),
    '30e2f23e-6e20-5d2b-aa63-59b6adf11d0f', jsonb_build_object(
      'mode', 'oral_check', 'height_px', 760,
      'scenario_id', 'dc7d2a81-8100-49c4-832a-d0e9e0e2effe',
      'scenario_spec', jsonb_build_object(
        'assignment_source_key', 'oral-check-slot-19',
        'context', 'This is the last lesson of the course -- how people actually move up here. Andrea checks it out loud because knowing there''s a real path, and what earns it, is the note she wants you to leave on.',
        'learner_goal', 'Demonstrate you understand how promotion actually works here, in your own words.',
        'success_criteria', jsonb_build_array(
          'Explains promotion as demonstrated performance and readiness, not tenure (consistent numbers, clean CRM, handoffs that turn into closed deals)',
          'Describes the coachability loop (hear feedback, apply it, come back better) instead of getting defensive',
          'Shows awareness of the growth ladder (harder leads and mentoring, then closing deals, or leading a team)'
        ),
        'fail_conditions', jsonb_build_array(
          'Treats promotion as being about time served rather than performance',
          'Gives no grounded answer -- guesses or answers a different question'
        )
      )
    )
  );

  select count(*) into v_target_count
  from content_blocks
  where id = any(v_fixed_block_ids)
    and content = (v_expected_prior_content -> id::text);
  if v_target_count <> 3 then
    raise exception 'Oral-check expansion fail_conditions fix refused: only % of 3 target rows exactly match the expected pre-fix content. Something else may have already touched these rows -- investigate before retrying.',
      v_target_count
      using errcode = '40001';
  end if;

  update public.content_blocks
  set content = jsonb_set(
    content,
    '{scenario_spec,fail_conditions}',
    content->'scenario_spec'->'fail_conditions' || fix.additional_fail_conditions
  )
  from (values
    ('4849582b-55e6-5c10-a853-1ba17cd44165'::uuid, jsonb_build_array(
      'Cannot attempt an answer to more than one of the three warm-up questions',
      'Only repeats a phrase from the lesson without saying it in their own words'
    )),
    ('852a2122-69b6-560d-af2d-b5ec57ffcb69'::uuid, jsonb_build_array(
      'Cannot name where the real answer actually lives (their own written agreement or their manager)'
    )),
    ('30e2f23e-6e20-5d2b-aa63-59b6adf11d0f'::uuid, jsonb_build_array(
      'Cannot describe the coachability loop (hearing feedback and applying it) at all'
    ))
  ) as fix(block_id, additional_fail_conditions)
  where content_blocks.id = fix.block_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 3 then
    raise exception 'Oral-check expansion fail_conditions fix refused: expected exactly 3 rows updated, updated %.',
      v_updated_count
      using errcode = '40001';
  end if;

  if exists (
    select 1 from content_blocks
    where id = any(v_fixed_block_ids)
      and jsonb_array_length(content->'scenario_spec'->'fail_conditions') < 3
  ) then
    raise exception 'Oral-check expansion fail_conditions fix refused: a target row still has fewer than 3 fail_conditions after update.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Oral-check expansion fail_conditions fix refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.oral_check_expansion_fail_conditions_fix_import_id', v_import_id, true);

  insert into public.content_import_oral_check_expansion_fail_conditions_fix_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    block_fix_count, fixed_block_ids, evidence, fixed_by
  ) values (
    v_import_id, v_prior_catalog_sha256, v_replacement_catalog_sha256,
    3, v_fixed_block_ids,
    jsonb_build_object(
      'operation', 'oral_check_expansion_fail_conditions_fix',
      'reason', 'manifest validator requires 3-8 non-empty fail_conditions; welcome-mindset had 1, compensation-engine and career-growth had 2 each',
      'prior_content', v_expected_prior_content
    ),
    auth.uid()
  );

  perform set_config('bmh.oral_check_expansion_fail_conditions_fix_import_id', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;
