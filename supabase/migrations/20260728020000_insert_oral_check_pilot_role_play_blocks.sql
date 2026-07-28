-- One-shot insertion of the 3-lesson Andrea Oral Check pilot: a role_play
-- block (content.mode = 'oral_check') appended after the existing flashcard
-- block in each of Real Estate Terms Glossary (lesson-content-slot-02), The
-- BMH Offer Playbook (lesson-content-slot-05), and KPIs and Sales Telemetry
-- (lesson-content-slot-16), bound to 3 real, live Closer Lab scenario IDs.
--
-- Mirrors 20260726170000_revise_released_content_blocks.sql's proven
-- pattern exactly -- hash-pinned CAS against the exact production state,
-- marker-gated insert-only guard, one immutable evidence row -- but is
-- deliberately NOT a general, reusable mechanism (that is what the separate,
-- still-hardening `claude/versioned-content-block-revision-v2` PR, #128, is
-- for; this pilot does not need it: single operator, off-hours, no
-- concurrent admin edits or historical backfill in scope). It is also NOT a
-- row in content_import_released_content_block_revision_records: that
-- table's own check constraints hard-code the FIRST correction's exact
-- shape (guide_update_count = 19, flashcard_update_count = 19,
-- role_play_insert_count = 6, mutations array length = 44) and cannot
-- accept a differently-shaped second correction. This defines a parallel,
-- equally exact-count-guarded evidence table sized for THIS one operation
-- (3 inserts, 0 updates) instead.
--
-- Hash-pin provenance: production project dhvfsyteqsxagokoerrx,
-- read-only-verified 2026-07-28 12:40:42 UTC via
-- select public.fn_course_import_catalog_sha256('bmh-employee-training-v1').
-- If production drifts before this migration is applied (e.g. any admin
-- edit lands in the meantime), the preflight check below fails closed with
-- the live hash in the error message -- re-derive v_expected_prior_catalog_sha256
-- from that value and re-author before retrying. Never loosen the check to
-- work around a mismatch.
--
-- HANDOFF NOTE FOR WHOEVER RESUMES PR #128 (claude/versioned-content-block-revision-v2):
-- This migration's `fn_guard_imported_content_block_insert_v1` extension
-- below is safe under CURRENT main (verified: fn_insert_oral_check_pilot_role_play_blocks()
-- applies and, once actually invoked, self-invokes cleanly against a fresh
-- database with no #128 migrations present -- see
-- supabase/tests/056_oral_check_pilot_role_play_blocks.sql). It is NOT
-- automatically safe once #128 merges. #128's own migration
-- (20260727180000) introduces a WHOLESALE NEW function,
-- fn_guard_imported_content_block_insert_v2, and repoints the
-- guard_imported_catalog_insert TRIGGER to call v2 instead of v1 -- it does
-- not `create or replace` v1, it replaces which function the trigger calls.
-- v2 has no knowledge of this migration's oral-check-pilot marker (it only
-- recognizes the apply-marker and its own generalized v2-revision-payload
-- check). Because #128's migration timestamps (20260727180000,
-- 20260727180500) sort BEFORE this file's (20260728020000) and BEFORE
-- 20260728050000_apply_oral_check_pilot_role_play_blocks.sql (the
-- self-invoking insert itself, split out from this file in round-4 review
-- -- see that migration's header), a full fresh-database replay of the
-- ENTIRE migration history after #128 merges would apply #128's migrations
-- first (installing v2 and repointing the trigger), THEN this migration and
-- 20260728030000 (installing the insert and rollback functions, neither of
-- which mutate the live catalog on their own), THEN 20260728050000's
-- self-invoking insert -- which would hit the ALREADY-ACTIVE v2 trigger,
-- which rejects it outright, aborting that migration on replay. This is
-- fine for the actual production apply (this migration set runs standalone
-- against real production, which will never see #128's migrations run
-- before it, only after 20260728050000 has already committed) -- and fine
-- for every environment where this migration set is applied BEFORE #128
-- ever merges. It only bites on a from-scratch fresh-database rebuild (a
-- new environment, a CI/hosted-test rebuild) performed AFTER #128 has
-- merged. Whoever resumes #128 must either (a) add an equivalent
-- oral-check-pilot exact-hash branch to fn_guard_imported_content_block_insert_v2
-- mirroring what this migration added to v1, or (b) confirm every real
-- target database already has 20260728050000 applied before #128 merges,
-- so a from-scratch replay never actually needs to run that migration's
-- insert branch again (it would only ever be replayed against an EMPTY
-- database that has never had the oral checks inserted, which should not
-- occur in practice once this has shipped everywhere -- but confirm before
-- assuming). Separately: #128's phase-2
-- backfill (20260727180500, fn_backfill_v1_content_block_revisions) merges
-- three OTHER legacy receipt tables into its shared ledger via a causal
-- replay; it does not know about content_import_oral_check_pilot_role_play_records
-- (this migration's evidence table) at all. Whoever resumes #128 must
-- extend that backfill's causal-replay queue to also ingest this table's one
-- receipt row as an anchor/legacy source, or the backfill's final
-- live-vs-replayed catalog comparison will fail for this import after
-- #128's phase 1 has already committed and retired the legacy write paths
-- -- precisely the same production-breaking shape as the CRITICAL bug #128
-- itself already fixed once for the other three legacy receipt tables.

set lock_timeout = '10s';

create table public.content_import_oral_check_pilot_role_play_records (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  role_play_insert_count integer not null check (role_play_insert_count = 3),
  mutations jsonb not null check (jsonb_typeof(mutations) = 'array' and jsonb_array_length(mutations) = 3),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  revised_at timestamptz not null default now(),
  revised_by uuid,
  primary key (import_id)
);

comment on table public.content_import_oral_check_pilot_role_play_records is
  'Immutable audit evidence for the one-shot Andrea Oral Check pilot role-play insertion (3 blocks, 3 lessons). Exact-count guarded like content_import_released_content_block_revision_records, but sized for this single operation -- never reused for a second correction. This is a genuinely ONE-SHOT operation: a second invocation of fn_insert_oral_check_pilot_role_play_blocks always refuses once a row exists here, regardless of live catalog state -- see that function''s comment.';

alter table public.content_import_oral_check_pilot_role_play_records enable row level security;
revoke all on table public.content_import_oral_check_pilot_role_play_records
from public, anon, authenticated;
grant select on table public.content_import_oral_check_pilot_role_play_records
to service_role;

create or replace function public.fn_guard_content_import_oral_check_pilot_role_play_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.oral_check_pilot_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.oral_check_pilot_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Oral-check pilot role-play insertion records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_content_import_oral_check_pilot_role_play_record()
from public, anon, authenticated;

create trigger content_import_oral_check_pilot_role_play_records_guard
before insert or update or delete on public.content_import_oral_check_pilot_role_play_records
for each row execute function public.fn_guard_content_import_oral_check_pilot_role_play_record();

-- Extend the existing imported-content-block insert guard with ONE new
-- exact-hash branch for this operation, alongside the untouched original
-- apply-marker and 44-block-correction branches (migrations 033,
-- 20260726170000). Safe under CURRENT main -- see the handoff note above
-- for what changes once PR #128 merges.
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
  raise exception 'Imported content blocks may only be created by the exact apply or released content revision operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_content_block_insert_v1()
from public, anon, authenticated;

create or replace function public.fn_insert_oral_check_pilot_role_play_blocks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id constant text := 'bmh-employee-training-v1';
  -- Read-only-verified against production 2026-07-28 12:40:42 UTC -- see
  -- the header comment. If this no longer matches the live catalog when
  -- this migration is applied, the preflight check below aborts with both
  -- values in the error message; re-derive and re-author, never loosen.
  v_expected_prior_catalog_sha256 constant text :=
    '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2';
  v_mutations jsonb;
  v_database_payload_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_inserted_count integer;
  v_target_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Oral-check pilot role-play insertion requires service_role.'
      using errcode = '42501';
  end if;

  -- Genuinely ONE-SHOT: if this has already been performed once (a row
  -- exists in the evidence table for this import), refuse EVERY subsequent
  -- invocation outright -- never re-verify and report success. An earlier
  -- version of this function tried to distinguish "safe idempotent retry"
  -- from "unsafe replay" by re-checking the payload hash and the 3 target
  -- rows, but that check never compared the live catalog against the
  -- receipt's own recorded replacement_catalog_sha256 -- an unrelated later
  -- catalog edit (any admin touching any other part of this course) would
  -- still report 'already_inserted' with a stale implication that nothing
  -- has changed since. Simpler and safer: this operation runs exactly once,
  -- ever. To verify it already succeeded, query
  -- content_import_oral_check_pilot_role_play_records directly -- do not
  -- re-invoke this function to check.
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_records
    where import_id = v_import_id
  ) then
    raise exception 'Oral-check pilot role-play insertion refused: this one-shot operation has already been performed for %. There is nothing to retry or re-verify by calling this function again -- query content_import_oral_check_pilot_role_play_records directly.',
      v_import_id
      using errcode = '40001';
  end if;

  -- The exact 3-block mutation payload, built inline -- no companion TS
  -- script or separate invocation round-trip needed (unlike the 44-block
  -- correction's asset-verified, mixed update+insert payload, these 3 are
  -- plain role_play inserts with no storage asset dependency). block_ids
  -- are computed with the SAME deterministic scheme the manifest importer
  -- itself uses (deterministicImportId in src/lib/course-import/operations.ts:
  -- sha256(import_id || ':' || source_key), version/variant nibbles forced
  -- to 5/a) so these 3 blocks are indistinguishable, to exact
  -- reconciliation, from any other manifest-declared block -- see the
  -- matching entries added to content/course-manifests/bmh-employee-training.v1.json.
  -- scenario_id values are the real, live, persona-backed Closer Lab
  -- scenario IDs (verified read-only against project xqrkugdxpwhjscrheuqo,
  -- non-archived, 4 rubric goals each with 1 supporting document -- see
  -- docs/course-production/oral-check-pilot-production-attestation.json).
  -- scenario_spec mirrors the shape and field names of the 6 existing
  -- role-play blocks' content.scenario_spec exactly (assignment_source_key,
  -- context, learner_goal, success_criteria, fail_conditions) so these pass
  -- the same required-role-play manifest validator the other 6 do;
  -- assignment_source_key is a self-describing operation key (there is no
  -- real assignment these bind to), not a fabricated assignment reference.
  -- success_criteria is drawn verbatim from the Jarrad-approved weighted
  -- knowledge goals for each lesson (see the vault source doc referenced in
  -- the PR description) -- the same weights checked into Closer Lab
  -- production as this scenario's real rubric_goals rows. content.title is
  -- deliberately omitted on all 3: the "Talk with Andrea" label change
  -- (content-blocks.tsx / learner-parts.ts, this same PR) already supplies
  -- that as the render-time fallback whenever content.mode = 'oral_check'
  -- and no explicit title is set -- exactly this case.
  v_mutations := jsonb_build_array(
    jsonb_build_object(
      'block_id', '7300bba9-a9fc-582c-aa20-dd5d58754165',
      'lesson_id', 'dc391d4b-58f4-5a94-a97f-ca59c4d98f41',
      'source_key', 'block-oral-check-slot-02',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', 'e46baf56-d0ae-4621-87f3-07718f0744b2',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-02',
          'context', 'This lesson covers the core vocabulary a caller needs on a live call -- property and seller-situation terms, wholesaling mechanics, deal-math terms, and CRM/pipeline terms. Andrea checks it out loud because recognizing these terms in the moment on a real call is different from recognizing them on a written quiz.',
          'learner_goal', 'Demonstrate accurate understanding of the core terms in your own words, not a memorized definition.',
          'success_criteria', jsonb_build_array(
            'Correctly defines core property/seller-situation terms (distressed, off-market, MLS, DOM, FSBO)',
            'Explains the wholesaling mechanism (assignment of contract, assignment fee, and/or double close)',
            'Correctly defines ARV, MAO, and equity and how they relate to the offer calculation',
            'Correctly explains at least 2 transaction/CRM terms (PSA, EMD, title company, lien, Sandra, disposition)'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses or misstates the core property/seller-situation terms (e.g., calls a listed property "off-market")',
            'Cannot describe the wholesaling mechanism (assignment of contract vs. buying and reselling)',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', '4464ecdd-2650-59ed-a525-78871e846d20',
      'lesson_id', '823f016f-6e4c-5791-ac42-9f24c28040df',
      'source_key', 'block-oral-check-slot-05',
      'sort_order', 7,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', 'fd3b4f85-2407-426b-a21b-db9d7163ebbb',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-05',
          'context', 'This lesson covers the As-Is Cash Home Purchase offer, the four-step process, why sellers accept a below-market price, and how the offer number gets built. Andrea checks it out loud because explaining the offer to a real seller is different from reciting the script.',
          'learner_goal', 'Demonstrate accurate understanding of the offer and why it works, in your own words.',
          'success_criteria', jsonb_build_array(
            'Explains the core offer and the four-step process accurately',
            'Explains why sellers accept a below-market price (speed/certainty/simplicity/convenience trade-off)',
            'Walks through the offer formula (ARV minus repairs minus margin) with the correct general shape',
            'Names at least 2 Ideal-Seller-Profile criteria OR 2 not-a-fit criteria'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses or misstates the core offer terms (e.g., says the deal is not cash or claims commissions are charged)',
            'Cannot walk through the four-step process or the offer formula''s shape',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    ),
    jsonb_build_object(
      'block_id', '34758403-1ddd-5e3c-a054-b2f28310d8b8',
      'lesson_id', 'cccdb0ef-b907-5bce-ade1-3ff0b0d054ce',
      'source_key', 'block-oral-check-slot-16',
      'sort_order', 6,
      'content', jsonb_build_object(
        'mode', 'oral_check',
        'height_px', 760,
        'scenario_id', '7765693a-5f8a-4aa1-ac39-c21866624006',
        'scenario_spec', jsonb_build_object(
          'assignment_source_key', 'oral-check-slot-16',
          'context', 'This lesson covers what a KPI is, the six pipeline metrics tracked left to right, and how to use that order to diagnose exactly where a funnel is breaking. Andrea checks it out loud because using the numbers to self-diagnose is different from reciting the list.',
          'learner_goal', 'Demonstrate accurate understanding of the six metrics and how to read them, in your own words.',
          'success_criteria', jsonb_build_array(
            'Names the six metrics in the correct left-to-right order',
            'Explains dial count as an effort indicator, not a strict goal (names the speed-dialing risk)',
            'Correctly diagnoses at least one funnel-gap scenario (e.g., high quality conversations / low process calls = discovery or disqualifying-too-fast problem)',
            'Explains why metrics are tracked left-to-right (to pinpoint exactly where in the funnel something broke)'
          ),
          'fail_conditions', jsonb_build_array(
            'Confuses or misstates the six metrics or their order',
            'Cannot explain the left-to-right diagnostic logic when asked directly',
            'Gives no grounded answer -- guesses or answers a different question'
          )
        )
      )
    )
  );

  v_database_payload_sha256 := encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || v_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_oral_check_pilot_role_play_records,
    public.programs,
    public.courses,
    public.modules,
    public.lessons,
    public.content_blocks
  in share row exclusive mode;

  -- Confirm the exact published release lineage exists FIRST (mirrors
  -- 20260726170000's ordering) -- a fast, clear failure on any database
  -- that has never released this import at all (including every fresh
  -- local test database), before paying for the full catalog hash below.
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
    raise exception 'Oral-check pilot role-play insertion refused: exact published release lineage was not found.'
      using errcode = '42501';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_prior_catalog_sha256 <> v_expected_prior_catalog_sha256 then
    raise exception 'Oral-check pilot role-play insertion refused: catalog drifted from the exact production preflight (expected %, live %). Re-derive the hash pin against current production state before retrying.',
      v_expected_prior_catalog_sha256, v_prior_catalog_sha256
      using errcode = '40001';
  end if;

  perform set_config('bmh.oral_check_pilot_import_id', v_import_id, true);
  perform set_config('bmh.oral_check_pilot_payload_sha256', v_database_payload_sha256, true);

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
  if v_inserted_count <> 3 then
    raise exception 'Oral-check pilot role-play insertion refused: expected exactly 3 rows inserted.'
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
  if v_target_count <> 3 then
    raise exception 'Oral-check pilot role-play insertion refused: atomic target verification failed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(v_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Oral-check pilot role-play insertion refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

  insert into public.content_import_oral_check_pilot_role_play_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, role_play_insert_count, mutations, evidence, revised_by
  ) values (
    v_import_id, v_prior_catalog_sha256, v_replacement_catalog_sha256,
    v_database_payload_sha256, 3, v_mutations,
    jsonb_build_object(
      'operation', 'oral_check_pilot_role_play_insert',
      'lesson_source_keys', jsonb_build_array(
        'lesson-content-slot-02', 'lesson-content-slot-05', 'lesson-content-slot-16'
      )
    ),
    auth.uid()
  );

  perform set_config('bmh.oral_check_pilot_import_id', '', true);
  perform set_config('bmh.oral_check_pilot_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'inserted',
    'import_id', v_import_id,
    'role_play_insert_count', 3,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256
  );
end;
$$;

revoke all on function public.fn_insert_oral_check_pilot_role_play_blocks()
from public, anon, authenticated;
grant execute on function public.fn_insert_oral_check_pilot_role_play_blocks()
to service_role;

-- This migration DELIBERATELY does not self-invoke
-- fn_insert_oral_check_pilot_role_play_blocks() here (round-4 Codex review,
-- finding 1). Supabase applies each migration file as its own transactional
-- batch, so a self-invoking insert in THIS file could commit the 3 live
-- required blocks before a later-numbered migration installing the
-- rollback capability ever ran -- recreating the exact
-- insert-with-no-prepared-rollback incident state finding 3 (round-3) was
-- meant to eliminate, if deployment stopped or failed partway between the
-- two files. The actual forward invocation now lives in
-- 20260728050000_apply_oral_check_pilot_role_play_blocks.sql, which is
-- numbered after BOTH this file and
-- 20260728030000_rollback_oral_check_pilot_role_play_blocks.sql, and
-- asserts the rollback function and its evidence table actually exist
-- before invoking this one. This file only ever installs the function and
-- its evidence table/guard -- it makes no live-catalog changes on its own.
