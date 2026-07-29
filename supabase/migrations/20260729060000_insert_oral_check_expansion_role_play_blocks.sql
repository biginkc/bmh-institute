-- One-shot insertion of the 9-lesson Andrea Oral Check expansion: a role_play
-- block (content.mode = 'oral_check') appended after the existing flashcard
-- block in each of Welcome and Mindset, Tech Stack and Systems, Humanizing
-- the Lead, Sales Pipeline and Stage Ownership, Seller FAQ Decoder,
-- Conversation Flow Mastery, Closing and Deal Engineering, Compensation
-- Engine, and Career Growth Path (lesson-content-slot-01/03/04/06/12/14/15/
-- 17/19), bound to 9 real, live Closer Lab scenario IDs.
--
-- Mirrors 20260728020000_insert_oral_check_pilot_role_play_blocks.sql's
-- pattern exactly, scaled from 3 blocks to 9 -- hash-pinned CAS against the
-- exact production state, marker-gated insert-only guard, one immutable
-- evidence row. Deliberately not a general, reusable mechanism (single
-- operator, off-hours, no concurrent admin edits in scope) and deliberately
-- not a row in either of the two existing exact-count-guarded evidence
-- tables (the pilot's is hard-pinned to 3; the released-content-block-
-- revision table is hard-pinned to a different, unrelated shape) -- this
-- defines a third, parallel evidence table sized for this one operation
-- (9 inserts, 0 updates) instead.
--
-- Closer Lab side is already fully built and live: all 12 role_plays
-- (3 pilot + 9 here), their personas, and their rubric_goals exist in
-- project xqrkugdxpwhjscrheuqo with archived_at is null -- verified
-- read-only against production immediately before authoring this migration.
-- This migration only ever touches Institute's own content_blocks; it does
-- not write to Closer Lab.
--
-- Content is the Jarrad-approved v2 rollout copy (context / learner_goal /
-- success_criteria / fail_conditions per lesson) -- see the vault source
-- doc referenced in the PR description. Unlike the pilot's 6 blocks, three
-- of these 9 (welcome-mindset, compensation-engine, career-growth) carry 3
-- success_criteria instead of 4, matching their approved content exactly --
-- there is no fixed-count constraint on this array anywhere in this
-- mechanism (content_blocks.content is unconstrained jsonb; the exact-match
-- CAS pins the whole block payload, not a per-field cardinality), so this
-- is a normal, unremarkable content difference, not a schema change.
--
-- Hash-pin provenance: production project dhvfsyteqsxagokoerrx,
-- read-only-verified via select public.fn_course_import_catalog_sha256(
-- 'bmh-employee-training-v1') immediately before this migration was
-- authored. If production drifts before this migration is applied (e.g. any
-- admin edit lands in the meantime, including the pilot's own rollback being
-- invoked), the preflight check below fails closed with the live hash in
-- the error message -- re-derive v_expected_prior_catalog_sha256 from that
-- value and re-author before retrying. Never loosen the check to work
-- around a mismatch.
--
-- Deployment sequencing mirrors the pilot exactly: this file only installs
-- the evidence table, its guard, the extended imported-content-block insert
-- guard, and the insert function -- it does not self-invoke. The rollback
-- capability (20260729060500) must exist before the actual forward
-- invocation (20260729061000) is allowed to run at all -- enforced both by
-- that later migration's own preflight AND by an identical assertion inside
-- fn_insert_oral_check_expansion_role_play_blocks() itself, so no call path
-- (the apply migration's wrapper, a direct RPC, anything) can mutate the
-- catalog without a prepared rollback path already installed.

set lock_timeout = '10s';

create table public.content_import_oral_check_expansion_role_play_records (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  role_play_insert_count integer not null check (role_play_insert_count = 9),
  mutations jsonb not null check (jsonb_typeof(mutations) = 'array' and jsonb_array_length(mutations) = 9),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  revised_at timestamptz not null default now(),
  revised_by uuid,
  primary key (import_id)
);

comment on table public.content_import_oral_check_expansion_role_play_records is
  'Immutable audit evidence for the one-shot Andrea Oral Check expansion role-play insertion (9 blocks, 9 lessons). Exact-count guarded like content_import_oral_check_pilot_role_play_records, but sized for this single operation -- never reused for a second correction. This is a genuinely ONE-SHOT operation: a second invocation of fn_insert_oral_check_expansion_role_play_blocks always refuses once a row exists here, regardless of live catalog state -- see that function''s comment.';

alter table public.content_import_oral_check_expansion_role_play_records enable row level security;
revoke all on table public.content_import_oral_check_expansion_role_play_records
from public, anon, authenticated;
grant select on table public.content_import_oral_check_expansion_role_play_records
to service_role;

create or replace function public.fn_guard_content_import_oral_check_expansion_role_play_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.oral_check_expansion_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.oral_check_expansion_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Oral-check expansion role-play insertion records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_content_import_oral_check_expansion_role_play_record()
from public, anon, authenticated;

create trigger content_import_oral_check_expansion_role_play_records_guard
before insert or update or delete on public.content_import_oral_check_expansion_role_play_records
for each row execute function public.fn_guard_content_import_oral_check_expansion_role_play_record();

-- Extend the existing imported-content-block insert guard with ONE new
-- exact-hash branch for this operation, alongside the untouched original
-- apply-marker, 44-block-correction, and oral-check-pilot branches
-- (migrations 033, 20260726170000, 20260728020000). This function's other
-- three branches are copied verbatim, unchanged.
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
  raise exception 'Imported content blocks may only be created by the exact apply or released content revision operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_content_block_insert_v1()
from public, anon, authenticated;

create or replace function public.fn_insert_oral_check_expansion_role_play_blocks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  -- Read-only-verified against production immediately before this migration
  -- was authored. If this no longer matches the live catalog when this
  -- migration is applied, the preflight check below aborts with both values
  -- in the error message; re-derive and re-author, never loosen.
  v_expected_prior_catalog_sha256 constant text :=
    '4978ca4f5e2f6b862e9f30fe2c50ebe6b0dcb5b0dc07b76235d9ced553a0bfb1';
  v_mutations jsonb;
  v_database_payload_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_inserted_count integer;
  v_target_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Oral-check expansion role-play insertion requires service_role.'
      using errcode = '42501';
  end if;

  -- This function must never mutate the catalog without a prepared rollback
  -- path already in place -- mirrors the pilot's own in-body assertion
  -- (20260728020000), which fires regardless of who can call this function
  -- or when. Defense in depth: EXECUTE is also deliberately deferred to
  -- 20260729060500, after the rollback capability that check requires has
  -- actually been installed -- see this migration's tail.
  if to_regclass('public.content_import_oral_check_expansion_role_play_rollback_records') is null
    or to_regprocedure('public.fn_rollback_oral_check_expansion_role_play_blocks()') is null
  then
    raise exception 'Oral-check expansion role-play insertion refused: the rollback capability (content_import_oral_check_expansion_role_play_rollback_records / fn_rollback_oral_check_expansion_role_play_blocks) is not installed. This function must never mutate the catalog without a prepared rollback path already in place.'
      using errcode = '55000';
  end if;

  -- Genuinely ONE-SHOT, mirroring the pilot's own philosophy exactly: once
  -- an evidence row exists, refuse every subsequent invocation outright.
  -- Never re-verify and report success -- query
  -- content_import_oral_check_expansion_role_play_records directly to check
  -- whether this already happened.
  if exists (
    select 1 from public.content_import_oral_check_expansion_role_play_records
    where import_id = v_import_id
  ) then
    raise exception 'Oral-check expansion role-play insertion refused: this one-shot operation has already been performed for %. There is nothing to retry or re-verify by calling this function again -- query content_import_oral_check_expansion_role_play_records directly.',
      v_import_id
      using errcode = '40001';
  end if;

  -- The exact 9-block mutation payload, built inline -- same shape as the
  -- pilot's 3 (assignment_source_key, context, learner_goal,
  -- success_criteria, fail_conditions). block_ids use the SAME
  -- deterministic scheme the manifest importer uses (deterministicImportId
  -- in src/lib/course-import/operations.ts: sha256(import_id || ':' ||
  -- source_key), version/variant nibbles forced to 5/a), verified to
  -- reproduce the pilot's own 3 known block_ids exactly before being used
  -- to compute these 9. scenario_id values are the real, live, persona- and
  -- rubric_goals-backed Closer Lab scenario IDs (verified read-only against
  -- project xqrkugdxpwhjscrheuqo, non-archived). content.title is
  -- deliberately omitted on all 9, matching the pilot: content-blocks.tsx's
  -- "Talk with Andrea" render-time fallback already supplies it whenever
  -- content.mode = 'oral_check' and no explicit title is set.
  v_mutations := jsonb_build_array(
    jsonb_build_object(
      'block_id', '4849582b-55e6-5c10-a853-1ba17cd44165',
      'lesson_id', '90ceaa26-0992-5991-a1c6-07070e3f7200',
      'source_key', 'block-oral-check-slot-01',
      'sort_order', 7,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
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
      )
    ),
    jsonb_build_object(
      'block_id', '60f604b1-70b4-5743-a4f6-0bbb0993b9ef',
      'lesson_id', '4b705622-f92a-553a-a4ac-8f74ea8ea097',
      'source_key', 'block-oral-check-slot-03',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', '37ac4bc8-5f76-4cd4-9a96-37e6c3e36e7a',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-03',
          'context', 'This lesson covers the daily tools -- Sandra, Closer Lab, and DialPad -- and why using them right (or working around them) matters before you start calling. Andrea checks it out loud because knowing you''ve got the map matters more than memorizing menus.',
          'learner_goal', 'Demonstrate you understand what each tool is for and why it matters, in your own words.',
          'success_criteria', jsonb_build_array(
            'Explains why the tools matter (keeps the team organized, nothing falls through the cracks)',
            'Explains what Sandra does (the CRM -- leads, notes, deal stages, and tasks; the shared record)',
            'Explains what Closer Lab does (practice role-plays against an AI before real calls, with feedback on pacing, filler words, confidence)',
            'Explains what DialPad does (the phone system -- calls go through it and get recorded for coaching, tracks call activity)'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses or misstates what one of the core tools does',
            'Cannot explain why the tools matter beyond "I have to use them"',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', '99568eab-f22d-5978-a0a7-d779afc0ccd0',
      'lesson_id', '43285b5e-9329-516c-aeff-89cbd90c02a2',
      'source_key', 'block-oral-check-slot-04',
      'sort_order', 8,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', '0b3d9673-54b7-4ac5-a5e6-b907f6ec043d',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-04',
          'context', 'This lesson is the heart of the course -- who''s really behind each lead, the difference between a motivated seller and someone just curious, and recognizing who you can and can''t help. Andrea checks it out loud because seeing the people, not the list, changes how every call goes.',
          'learner_goal', 'Demonstrate you can recognize real seller situations, motivation, and fit, in your own words.',
          'success_criteria', jsonb_build_array(
            'Names three real seller situations that bring sellers to us (inherited property, foreclosure, tired landlord, rough house, divorce, out-of-state owner, etc.)',
            'Explains the difference between a motivated seller and someone just curious (a real reason plus a timeline vs. no urgency)',
            'Recognizes motivation-signal language (phrases like "I just need this off my plate" or "I''m behind on payments")',
            'Recognizes who we can''t help (already listed with a realtor, can''t authorize the sale, no equity, commercial or vacant land)'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses or misstates what makes a seller motivated vs. curious',
            'Cannot name a real seller situation or a signal phrase',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', 'e1adf3e7-8abd-5a5a-ab24-c1ee33f216d7',
      'lesson_id', 'da9a3102-025d-5585-a927-5399c1f564d5',
      'source_key', 'block-oral-check-slot-06',
      'sort_order', 7,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', '345d2756-c1df-417f-ac00-8a4509f0a9c8',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-06',
          'context', 'This lesson covers how deals move through the system, the handoff to acquisition, the 80/20 rule, and what actually counts as a lead moving forward. Andrea checks it out loud because understanding your part in the pipeline matters more than memorizing every stage name.',
          'learner_goal', 'Demonstrate you understand how a deal moves and where you fit, in your own words.',
          'success_criteria', jsonb_build_array(
            'Knows the acquisition team receives the handoff after qualification',
            'Explains the 80/20 person-over-property rule and why (the house isn''t the problem, the situation is)',
            'Describes what a clean handoff includes (the seller''s story, motivation, expectations, property details, plus a warm transfer or set appointment)',
            'Understands leads move forward on real conversations, not attempts'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses or misstates the 80/20 rule or reverses it',
            'Cannot describe what a clean handoff includes',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', 'a9ca1f49-e456-5927-a135-64f18c4868a5',
      'lesson_id', 'f8b00300-cb73-5851-ad21-960d3ae27243',
      'source_key', 'block-oral-check-slot-12',
      'sort_order', 7,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', 'abb45d78-8cd6-4167-a567-b78dc1f4fc2e',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-12',
          'context', 'This lesson covers answering sellers'' plain questions like a person, not a script -- the scam concern, the price trade-off, repairs, and what happens after signing. Andrea plays the seller and checks it out loud because a warm, honest answer under real pressure is different from reciting the FAQ.',
          'learner_goal', 'Answer a seller''s plain questions warmly and honestly, in your own words.',
          'success_criteria', jsonb_build_array(
            'Names the underlying concerns sellers usually have (trust, fairness, simplicity) in some form',
            'Handles the scam concern with warmth and real specifics (licensed title company, attorney can review everything, never pay us anything)',
            'Explains the price trade-off in plain language (we buy as-is and take on repairs, risk, and cost; the seller gets speed, certainty, and zero hassle)',
            'Handles the repairs and after-signing questions reassuringly (no repairs needed, our team handles title and logistics through closing)'
          ),
          'fail_conditions', jsonb_build_array(
            'Gets defensive or dismissive instead of acknowledging the concern',
            'Cannot explain the price trade-off without jargon a neighbor wouldn''t understand',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', '52811b0f-70d6-5ee8-ac4e-db7a9d29857b',
      'lesson_id', '386dfa52-b81e-5f7e-ade4-49f16bd6b829',
      'source_key', 'block-oral-check-slot-14',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', '1f4414cb-4d6a-4209-a444-c5903c43cd1d',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-14',
          'context', 'This lesson stitches the whole call together -- protecting the price anchor, handling a competing offer, painting the finish line, and exiting gracefully when the gap''s too wide. Andrea throws real moments at you and checks the reasoning out loud, not a recited script.',
          'learner_goal', 'Reason through real call moments and explain your move, in your own words.',
          'success_criteria', jsonb_build_array(
            'Protects the price anchor (learns the seller''s number before giving ours)',
            'Answers a higher competing offer with a certainty comparison, not a bigger bid',
            'Uses the paint-the-finish move to surface non-price obstacles (where they''ll live, what''s in their pocket, what''s hardest about getting there)',
            'Exits gracefully when the gap''s too wide, leaving the door open'
          ),
          'fail_conditions', jsonb_build_array(
            'Gives a number before learning the seller''s number',
            'Panics or chases a competing offer with a higher bid instead of comparing certainty',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', 'ac93afcb-f1bb-5326-a8d2-761dd42f9755',
      'lesson_id', '3f88c721-18a7-5f30-a3c9-098d2349ef95',
      'source_key', 'block-oral-check-slot-15',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', 'e0eadd9b-3261-4470-b46e-da4e292ed3f1',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-15',
          'context', 'This lesson covers the endgame -- why closing is easy when the earlier work was real, what happens after signing, and why deals fall apart. Andrea checks it out loud because seeing the endgame matters even though you don''t present the offers yourself.',
          'learner_goal', 'Demonstrate you understand why closings are won or lost weeks earlier, in your own words.',
          'success_criteria', jsonb_build_array(
            'Explains why closing is easy when the earlier work was real (the seller already trusts us and has basically decided)',
            'Describes roughly what happens after signing and the rep''s support role (title, logistics, keeping a nervous seller calm)',
            'Names why deals fall apart (seller''s remorse, an undiscovered decision-maker, title problems, a higher offer) and connects it to discovery',
            'Responds to "I was hoping for more" with acknowledge-and-ask, not defensiveness'
          ),
          'fail_conditions', jsonb_build_array(
            'Treats a signed contract as the finish line instead of the start of a process',
            'Cannot name a real reason deals fall apart',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', '852a2122-69b6-560d-af2d-b5ec57ffcb69',
      'lesson_id', '3eb01e3e-f9e2-5b15-a08e-53c965c7438a',
      'source_key', 'block-oral-check-slot-17',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
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
      )
    ),
    jsonb_build_object(
      'block_id', '30e2f23e-6e20-5d2b-aa63-59b6adf11d0f',
      'lesson_id', 'badd265f-d900-5229-ae28-afab601df8b4',
      'source_key', 'block-oral-check-slot-19',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
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
    )
  );

  v_database_payload_sha256 := encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex');

  -- Same widened lock set the pilot uses -- every table
  -- fn_course_import_catalog_sha256 reads, taken before the first read, so
  -- both reads and the insert observe one writer-excluded state the receipt
  -- provably matches. Kept in the same relative order as this migration's
  -- rollback lock set so the two operations can never deadlock against each
  -- other, and matches the pilot's own lock set exactly (same tables, same
  -- checksum function).
  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || v_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_oral_check_expansion_role_play_records,
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
    raise exception 'Oral-check expansion role-play insertion refused: exact published release lineage was not found.'
      using errcode = '42501';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_prior_catalog_sha256 <> v_expected_prior_catalog_sha256 then
    raise exception 'Oral-check expansion role-play insertion refused: catalog drifted from the exact production preflight (expected %, live %). Re-derive the hash pin against current production state before retrying.',
      v_expected_prior_catalog_sha256, v_prior_catalog_sha256
      using errcode = '40001';
  end if;

  perform set_config('bmh.oral_check_expansion_import_id', v_import_id, true);
  perform set_config('bmh.oral_check_expansion_payload_sha256', v_database_payload_sha256, true);

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
  if v_inserted_count <> 9 then
    raise exception 'Oral-check expansion role-play insertion refused: expected exactly 9 rows inserted.'
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
  if v_target_count <> 9 then
    raise exception 'Oral-check expansion role-play insertion refused: atomic target verification failed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Oral-check expansion role-play insertion refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

  insert into public.content_import_oral_check_expansion_role_play_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, role_play_insert_count, mutations, evidence, revised_by
  ) values (
    v_import_id, v_prior_catalog_sha256, v_replacement_catalog_sha256,
    v_database_payload_sha256, 9, v_mutations,
    jsonb_build_object(
      'operation', 'oral_check_expansion_role_play_insert',
      'lesson_source_keys', jsonb_build_array(
        'lesson-content-slot-01', 'lesson-content-slot-03', 'lesson-content-slot-04',
        'lesson-content-slot-06', 'lesson-content-slot-12', 'lesson-content-slot-14',
        'lesson-content-slot-15', 'lesson-content-slot-17', 'lesson-content-slot-19'
      )
    ),
    auth.uid()
  );

  perform set_config('bmh.oral_check_expansion_import_id', '', true);
  perform set_config('bmh.oral_check_expansion_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'inserted',
    'import_id', v_import_id,
    'role_play_insert_count', 9,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256
  );
end;
$$;

-- EXECUTE deliberately not granted to service_role here -- deferred to
-- 20260729060500_rollback_oral_check_expansion_role_play_blocks.sql, after
-- the rollback capability this function's own in-body check requires has
-- actually been installed. Until that migration commits, no role can invoke
-- this function at all, not just "can invoke it but it refuses."
revoke all on function public.fn_insert_oral_check_expansion_role_play_blocks()
from public, anon, authenticated, service_role;

-- This migration deliberately does not self-invoke
-- fn_insert_oral_check_expansion_role_play_blocks() here, mirroring the
-- pilot's own reasoning exactly: Supabase applies each migration file as
-- its own transactional batch, so a self-invoking insert in THIS file could
-- commit the 9 live required blocks before a later-numbered migration
-- installing the rollback capability ever ran. The actual forward
-- invocation lives in 20260729061000_apply_oral_check_expansion_role_play_blocks.sql,
-- numbered after both this file and
-- 20260729060500_rollback_oral_check_expansion_role_play_blocks.sql, and
-- asserts the rollback function and its evidence table actually exist
-- before invoking this one.
