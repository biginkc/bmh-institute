begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- Regression suite for
-- 20260730060000_insert_objection_oral_check_role_play_blocks.sql, mirroring
-- supabase/tests/056_oral_check_pilot_role_play_blocks.sql's structure and
-- coverage, scaled from the pilot's 3 blocks to this operation's 2
-- (Objection Architecture and Objection Scripts Playbook,
-- lesson-content-slot-09 and -10).
--
-- This file also closes a real gap the expansion (20260729060000) left
-- behind: that migration shipped with no PGlite/Postgres regression suite at
-- all ("Known gap" in PR #132's own commit message), so nothing anywhere
-- proved its branch of fn_guard_imported_content_block_insert_v1 still
-- worked. This migration rewrites that shared guard function, which means a
-- silent mistake in the copied-verbatim branches would go unnoticed. The
-- "every pre-existing guard branch still behaves" section below therefore
-- exercises ALL FOUR pre-existing branches (apply marker, released content
-- revision, oral-check pilot, oral-check expansion) plus the final refusal,
-- not just this migration's own new one.

-- Structural: the function and its evidence table must exist, with the
-- exact-count check constraints this one-shot operation depends on.
do $$
begin
  if to_regprocedure(
    'public.fn_insert_oral_check_objections_role_play_blocks()'
  ) is null then
    raise exception 'oral-check objections role-play insertion function is absent';
  end if;
  if to_regclass(
    'public.content_import_oral_check_objections_role_play_records'
  ) is null then
    raise exception 'oral-check objections role-play insertion audit table is absent';
  end if;
end;
$$;

-- Authorization: only service_role may run this.
do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'authenticated caller ran the oral-check objections insertion';
  exception when sqlstate '42501' then
    if sqlerrm not like '%requires service_role%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$$;

-- No release record for bmh-employee-training-v1 at all (true of every
-- fresh database, this one included): the release-lineage check must fail
-- fast and clear, before ever touching the catalog hash.
do $$
begin
  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'the insertion ran with no release record for bmh-employee-training-v1 at all';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact published release lineage was not found%' then raise; end if;
  end;
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
  ) then
    raise exception 'the refused insertion left content blocks behind';
  end if;
end;
$$;

-- A minimal published release for the same import_id (structurally real,
-- but a fresh local database can never reproduce production's EXACT
-- catalog byte-for-byte, so its computed live hash can never equal the
-- hardcoded production hash pin). This proves the fail-closed CAS check
-- itself: a production-shaped release that is NOT the exact expected state
-- must still refuse, never silently insert against a mismatched assumption.
--
-- Wrapped in its own savepoint: content_import_release_records is guarded
-- against UPDATE/DELETE unconditionally (immutable evidence, by design --
-- see fn_guard_content_import_release_record), so the only way to free up
-- the 'bmh-employee-training-v1' import_id primary key for the
-- genuine-success rehearsal further down this file is a transaction-level
-- rollback, not a DML statement.
savepoint before_catalog_mismatch_fixture;
do $$
declare
  v_program_id uuid := '06500000-0000-5000-a000-000000000001';
  v_course_id uuid := '06500000-0000-5000-a000-000000000002';
begin
  perform set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Local Objections Preflight Fixture', 'bmh-employee-training-v1', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Local Objections Preflight Course', 'bmh-employee-training-v1', false, false);
  perform set_config('bmh.apply_import_id', '', true);

  perform set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'bmh-employee-training-v1', v_program_id,
    '06500000-0000-5000-a000-000000000003', '06500000-0000-5000-a000-000000000004',
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);

  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'the insertion ran against a local fixture whose catalog cannot match the hardcoded production hash pin';
  exception when sqlstate '40001' then
    if sqlerrm not like '%catalog drifted from the exact production preflight%' then raise; end if;
  end;
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
  ) then
    raise exception 'the refused insertion left content blocks behind on catalog mismatch';
  end if;
  if exists (
    select 1 from public.content_import_oral_check_objections_role_play_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'the refused insertion left an evidence row behind';
  end if;
end;
$$;

-- Every pre-existing branch of fn_guard_imported_content_block_insert_v1 is
-- byte-for-byte unchanged by this migration's rewrite. Prove that
-- behaviourally, branch by branch, rather than trusting a careful copy and
-- paste. (Still inside before_catalog_mismatch_fixture's scope: reuses that
-- section's published program/course and release record, whose
-- manifest_sha256 is deliberately NOT the guard's pinned literal -- so the
-- three hash-pinned branches are additionally proven to depend on that
-- release lineage, not just on their session markers.)
do $$
declare
  v_module_id uuid := '06500000-0000-5000-a000-000000000005';
  v_lesson_id uuid := '06500000-0000-5000-a000-000000000006';
begin
  perform set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);
  insert into public.modules (id, course_id, title, sort_order)
  values (v_module_id, '06500000-0000-5000-a000-000000000002', 'Guard Regression Module', 1);
  insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id)
  values (v_lesson_id, v_module_id, 'Guard Regression Lesson', 'content', 1, 'bmh-employee-training-v1');
  perform set_config('bmh.apply_import_id', '', true);

  -- Branch 5 (final): an ordinary, unmarked insert into an imported lesson
  -- must still be refused exactly as before.
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-000000000007', v_lesson_id, 'text',
      '{"html":"<p>Unmarked</p>"}'::jsonb, 1, false
    );
    raise exception 'an unmarked direct insert into an imported lesson was accepted after extending the guard';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;

  -- Branch 1 (apply marker, migration 033): still accepts.
  perform set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  ) values (
    '06500000-0000-5000-a000-000000000008', v_lesson_id, 'text',
    '{"html":"<p>Apply marker</p>"}'::jsonb, 1, false
  );
  perform set_config('bmh.apply_import_id', '', true);
  if not exists (
    select 1 from public.content_blocks where id = '06500000-0000-5000-a000-000000000008'
  ) then
    raise exception 'the apply-marker guard branch stopped accepting after the guard rewrite';
  end if;

  -- Branches 2-4 (released content revision, oral-check pilot, oral-check
  -- expansion) are all additionally gated on the release record carrying the
  -- guard's pinned manifest_sha256. This fixture's release record carries
  -- repeat('1', 64) instead, so all three must refuse here even with a
  -- perfectly correct session marker and payload hash. That is the exact
  -- behaviour the pinned literal exists to produce.
  perform set_config('bmh.revise_content_blocks_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.revise_content_blocks_payload_sha256',
    '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a', true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-000000000009', v_lesson_id, 'text',
      '{"html":"<p>Revision marker, wrong release lineage</p>"}'::jsonb, 2, false
    );
    raise exception 'the released-content-revision branch accepted an insert against a release record whose manifest_sha256 is not the pinned literal';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  perform set_config('bmh.revise_content_blocks_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_payload_sha256', '', true);

  perform set_config('bmh.oral_check_pilot_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.oral_check_pilot_payload_sha256',
    '893405d59d508783cbb96bb543ab41080337fa6aa06f92a106c10962c5fcfce5', true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-00000000000a', v_lesson_id, 'role_play',
      '{"mode":"oral_check"}'::jsonb, 3, true
    );
    raise exception 'the oral-check pilot branch accepted an insert against a release record whose manifest_sha256 is not the pinned literal';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  perform set_config('bmh.oral_check_pilot_import_id', '', true);
  perform set_config('bmh.oral_check_pilot_payload_sha256', '', true);

  perform set_config('bmh.oral_check_expansion_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.oral_check_expansion_payload_sha256',
    '08ffb8c5c0431b482cffaa8871cf6adf1e016b7b6f9568617ec544356dadab7e', true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-00000000000b', v_lesson_id, 'role_play',
      '{"mode":"oral_check"}'::jsonb, 4, true
    );
    raise exception 'the oral-check expansion branch accepted an insert against a release record whose manifest_sha256 is not the pinned literal';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  perform set_config('bmh.oral_check_expansion_import_id', '', true);
  perform set_config('bmh.oral_check_expansion_payload_sha256', '', true);

  -- This migration's OWN new branch is gated identically, and must refuse
  -- here for exactly the same reason.
  perform set_config('bmh.oral_check_objections_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.oral_check_objections_payload_sha256',
    '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016', true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-00000000000c', v_lesson_id, 'role_play',
      '{"mode":"oral_check"}'::jsonb, 5, true
    );
    raise exception 'the oral-check objections branch accepted an insert against a release record whose manifest_sha256 is not the pinned literal';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  perform set_config('bmh.oral_check_objections_import_id', '', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', '', true);
end;
$$;

-- The evidence table's own guard: nobody may insert directly, even
-- service_role, without the exact marker + payload hash the function sets.
do $$
begin
  begin
    insert into public.content_import_oral_check_objections_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), 2, '[1,2]'::jsonb, '{}'::jsonb
    );
    raise exception 'a direct unmarked insert into the evidence table was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;
end;
$$;

-- Half-right markers are not enough: the guard binds the evidence row to
-- BOTH the import id and the exact payload hash. Prove each one alone still
-- refuses.
do $$
begin
  perform set_config('bmh.oral_check_objections_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', repeat('a', 64), true);
  begin
    insert into public.content_import_oral_check_objections_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016',
      2, '[1,2]'::jsonb, '{}'::jsonb
    );
    raise exception 'the evidence guard accepted a row whose payload hash marker does not match the row';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;

  perform set_config('bmh.oral_check_objections_import_id', 'some-other-import', true);
  perform set_config('bmh.oral_check_objections_payload_sha256',
    '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016', true);
  begin
    insert into public.content_import_oral_check_objections_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016',
      2, '[1,2]'::jsonb, '{}'::jsonb
    );
    raise exception 'the evidence guard accepted a row whose import id marker does not match the row';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;

  perform set_config('bmh.oral_check_objections_import_id', '', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', '', true);
end;
$$;

-- The evidence table's exact-count check constraints: this table exists
-- SPECIFICALLY because the pilot's (3), the expansion's (9), and the
-- released-content-block-revision table's own constraints can never accept
-- this operation's shape (2, 2) -- prove the reverse holds too: THIS table
-- refuses anything other than exactly 2.
do $$
begin
  alter table public.content_import_oral_check_objections_role_play_records
    disable trigger oral_check_objections_role_play_records_guard;
  begin
    insert into public.content_import_oral_check_objections_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), 9, '[1,2,3,4,5,6,7,8,9]'::jsonb, '{}'::jsonb
    );
    raise exception 'the evidence table accepted role_play_insert_count = 9 (this table is scoped to exactly 2)';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    insert into public.content_import_oral_check_objections_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), 2, '[1]'::jsonb, '{}'::jsonb
    );
    raise exception 'the evidence table accepted a mutations array of length 1';
  exception when sqlstate '23514' then
    null;
  end;
  alter table public.content_import_oral_check_objections_role_play_records
    enable trigger oral_check_objections_role_play_records_guard;
end;
$$;

-- Retry-after-drift: once an evidence row exists for this import (this test
-- simulates that with the guard disabled -- the function's own first
-- successful run is what would normally create it), every subsequent
-- invocation must be refused with SQLSTATE 40001 UNCONDITIONALLY -- never
-- re-verify the live catalog and report success.
do $$
begin
  alter table public.content_import_oral_check_objections_role_play_records
    disable trigger oral_check_objections_role_play_records_guard;
  insert into public.content_import_oral_check_objections_role_play_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, role_play_insert_count, mutations, evidence
  ) values (
    'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
    '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016',
    2, '[1,2]'::jsonb,
    jsonb_build_object('operation', 'oral_check_objections_role_play_insert')
  );
  alter table public.content_import_oral_check_objections_role_play_records
    enable trigger oral_check_objections_role_play_records_guard;

  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'a retry after the one-shot evidence row already existed was not refused';
  exception when sqlstate '40001' then
    if sqlerrm not like '%this one-shot operation has already been performed%' then raise; end if;
  end;

  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
  ) then
    raise exception 'the refused retry left content blocks behind';
  end if;
end;
$$;
rollback to savepoint before_catalog_mismatch_fixture;

-- Everything above proves refusal paths. None of it ever lets
-- fn_insert_oral_check_objections_role_play_blocks() actually succeed and
-- take its real INSERT / target-row-verification / receipt-write path,
-- because v_expected_prior_catalog_sha256 is hardcoded to production's exact
-- FULL catalog and reproducing that byte-for-byte in a fresh local database
-- is not practical. This closes that gap honestly instead of leaving it
-- disclosed and untested: build a fixture from the REAL production
-- program/course/module/lesson rows the 2 hardcoded mutations actually
-- target (ids, titles, descriptions, and sort orders read-only-verified
-- against production project dhvfsyteqsxagokoerrx the same session this test
-- was written, matching content/course-manifests/bmh-employee-training.v1.json's
-- lesson-content-slot-09/-10 and their shared parent module exactly), and
-- stub ONLY fn_course_import_catalog_sha256 -- a DEPENDENCY the insertion
-- function calls to read the live catalog hash, not the insertion function
-- itself, which runs completely unmodified below -- to return this
-- operation's own hardcoded expected-prior-hash constant while neither
-- target block exists yet, and a different fixed value once they do (so the
-- function's own "hash must advance" check still holds for real).
--
-- DISCLOSED SCOPE: stubbing fn_course_import_catalog_sha256 means this
-- section does NOT re-prove that the hardcoded
-- '5fae6612...' constant still matches production's CURRENT full catalog
-- byte-for-byte -- that is a separate, live, point-in-time fact (verified
-- true immediately before this PR was authored: production project
-- dhvfsyteqsxagokoerrx, read-only via Supabase MCP execute_sql,
-- `select public.fn_course_import_catalog_sha256('bmh-employee-training-v1')`
-- returned exactly
-- '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95'),
-- never claimed to be re-verified by this test suite, and never will be
-- without either a full production-scale fixture or a live database
-- connection.
savepoint oral_check_objections_success_rehearsal;

create or replace function public.fn_course_import_catalog_sha256(p_import_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $stub$
  select case
    when p_import_id <> 'bmh-employee-training-v1' then repeat('0', 64)
    when exists (
      select 1 from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )
    ) then repeat('f', 64)
    else '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95'
  end;
$stub$;

-- Real production program/course/program_courses/module/lessons (id, title,
-- description, and every published/order field read-only-verified against
-- production). Inserted unpublished under the apply-import marker
-- (fn_guard_imported_catalog_insert), then published via UPDATE afterward.
do $$
begin
  perform set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);

  insert into public.programs (
    id, title, description, content_import_id, is_published,
    course_order_mode, certificate_enabled, sort_order
  ) values (
    '15a382c9-617c-5407-a880-af6303be74b2', 'BMH Employee Training',
    'Internal training for serving sellers, operating the pipeline, and growing at BMH Group.',
    'bmh-employee-training-v1', false, 'sequential', true, 0
  );
  insert into public.courses (
    id, title, description, content_import_id, is_published,
    certificate_enabled, sort_order
  ) values (
    'e743b27c-7e0d-5760-aa25-5dbd75656718', 'BMH Employee Training',
    'Six sequential sections covering the BMH way, seller conversations, operating systems, and performance.',
    'bmh-employee-training-v1', false, false, 0
  );
  insert into public.program_courses (id, program_id, course_id, sort_order)
  values (
    '8e8b2d86-6e11-59e5-acd2-332488b2341e',
    '15a382c9-617c-5407-a880-af6303be74b2',
    'e743b27c-7e0d-5760-aa25-5dbd75656718',
    0
  );

  -- Both target lessons share one real production module.
  insert into public.modules (id, course_id, title, description, sort_order) values
    ('70cfc9e3-bf2c-54b8-ab2a-2e71306936de', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Objections and Questions', 'Respond to concerns with empathy, structure, and accurate process information.', 4);

  -- The exact 2 real production lessons the migration's hardcoded lesson_id
  -- values target (bmh-employee-training.v1.json lesson-content-slot-09/-10).
  insert into public.lessons (
    id, module_id, title, description, lesson_type, sort_order,
    content_import_id, is_required_for_completion
  ) values
    ('25973272-2cfc-5357-ae82-18ed08db636b', '70cfc9e3-bf2c-54b8-ab2a-2e71306936de', 'Objection Architecture', 'Use a repeatable framework to understand concerns before selecting a response.', 'content', 1, 'bmh-employee-training-v1', true),
    ('29ab8578-76cb-5fe2-ab68-b9e097e570ed', '70cfc9e3-bf2c-54b8-ab2a-2e71306936de', 'Objection Scripts Playbook', 'Practice adaptable responses for price, timing, trust, competition, and decision-maker concerns.', 'content', 3, 'bmh-employee-training-v1', true);

  perform set_config('bmh.apply_import_id', '', true);

  -- The exact published release lineage the insertion function's preflight
  -- check requires, with the SAME manifest_sha256 literal the content_blocks
  -- insert guard trigger (fn_guard_imported_content_block_insert_v1)
  -- hardcodes for the oral-check-objections branch.
  perform set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'bmh-employee-training-v1', '15a382c9-617c-5407-a880-af6303be74b2',
    '06501000-0000-5000-a000-000000000001', '06501000-0000-5000-a000-000000000002',
    '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c',
    repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('6', 64), repeat('7', 64), repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);
end;
$$;

-- The one call path that must NOT work even now that every other
-- precondition is satisfied: an insert carrying this operation's session
-- markers but the WRONG payload hash. This is the whole point of pinning
-- the payload hash into the guard -- the markers alone are not a capability.
do $$
begin
  perform set_config('bmh.oral_check_objections_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', repeat('b', 64), true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-0000000000ff',
      '25973272-2cfc-5357-ae82-18ed08db636b', 'role_play',
      '{"mode":"oral_check"}'::jsonb, 9, true
    );
    raise exception 'the objections guard branch accepted an insert carrying the right markers but the wrong payload hash';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  perform set_config('bmh.oral_check_objections_import_id', '', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', '', true);
end;
$$;

-- The block-id scope fence. This branch is deliberately tighter than the
-- three hash-pinned branches that precede it: those accept ANY block id into
-- ANY lesson of the import for as long as the branch exists, and their
-- marker values are public literals sitting in pg_proc.prosrc. Prove that
-- possessing this operation's exact markers AND its exact, correct payload
-- hash still cannot create an arbitrary block -- only the 2 ids this
-- one-shot operation is allowed to create. Without the new.id fence this
-- insert would be ACCEPTED, and the marker pair would be a permanent
-- general-purpose insert capability over the whole released catalog.
do $$
begin
  perform set_config('bmh.oral_check_objections_import_id', 'bmh-employee-training-v1', true);
  perform set_config('bmh.oral_check_objections_payload_sha256',
    '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016', true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-0000000000fe',
      '25973272-2cfc-5357-ae82-18ed08db636b', 'role_play',
      '{"mode":"oral_check"}'::jsonb, 9, true
    );
    raise exception 'the objections guard branch accepted an arbitrary block id under this operation''s exact correct markers -- the marker pair is a general-purpose insert capability, not a scoped one';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  -- Same fence applies to a lesson this operation does not target, even with
  -- one of the 2 permitted block ids reused.
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '06500000-0000-5000-a000-0000000000fd',
      '29ab8578-76cb-5fe2-ab68-b9e097e570ed', 'text',
      '{"html":"<p>Arbitrary</p>"}'::jsonb, 9, false
    );
    raise exception 'the objections guard branch accepted an arbitrary text block under this operation''s exact correct markers';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
  perform set_config('bmh.oral_check_objections_import_id', '', true);
  perform set_config('bmh.oral_check_objections_payload_sha256', '', true);
end;
$$;

-- The genuine first invocation: every preflight check (auth, rollback
-- capability, release lineage, catalog CAS) now passes for real, so this
-- reaches the actual INSERT, atomic target-row verification,
-- replacement-hash computation, and guarded receipt write.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_insert_oral_check_objections_role_play_blocks();
  if v_result ->> 'status' <> 'inserted' then
    raise exception 'expected status=inserted, got %', v_result;
  end if;
  if v_result ->> 'import_id' <> 'bmh-employee-training-v1' then
    raise exception 'unexpected import_id in success result: %', v_result;
  end if;
  if (v_result ->> 'role_play_insert_count')::integer <> 2 then
    raise exception 'expected role_play_insert_count=2, got %', v_result;
  end if;
  if v_result ->> 'prior_catalog_sha256' <> '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95' then
    raise exception 'unexpected prior_catalog_sha256 in success result: %', v_result;
  end if;
  if v_result ->> 'catalog_sha256' <> repeat('f', 64) then
    raise exception 'unexpected replacement catalog_sha256 in success result: %', v_result;
  end if;
end;
$$;

-- Assert the exact 2 rows: id, lesson_id, block_type, sort_order, and
-- required flag all match the migration's hardcoded payload exactly.
do $$
begin
  if (
    select count(*) from public.content_blocks
    where (id, lesson_id, block_type, sort_order, is_required_for_completion) in (
      ('b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3', '25973272-2cfc-5357-ae82-18ed08db636b', 'role_play', 6, true),
      ('da8b819a-401d-5a9e-a7d9-ad237d128f0c', '29ab8578-76cb-5fe2-ab68-b9e097e570ed', 'role_play', 6, true)
    )
  ) <> 2 then
    raise exception 'the 2 inserted rows do not exactly match the migration''s hardcoded id/lesson_id/type/sort_order/required shape';
  end if;

  if (
    select count(*) from public.content_blocks
    where id = 'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3'
      and content = jsonb_build_object(
        'mode', 'oral_check', 'height_px', 760,
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
  ) <> 1 then
    raise exception 'block-oral-check-slot-09 content does not byte-match the migration''s hardcoded payload';
  end if;

  if (
    select count(*) from public.content_blocks
    where id = 'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      and content = jsonb_build_object(
        'mode', 'oral_check', 'height_px', 760,
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
  ) <> 1 then
    raise exception 'block-oral-check-slot-10 content does not byte-match the migration''s hardcoded payload';
  end if;

  -- content.title is deliberately absent on both -- the renderer's
  -- "Talk with Andrea" fallback supplies it. If a title ever appears here,
  -- the payload drifted from the pilot/expansion convention.
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    ) and content ? 'title'
  ) then
    raise exception 'an objections oral-check block carries an explicit content.title, breaking the render-time fallback convention';
  end if;

  -- src/lib/course-import/manifest.ts's validateCourseManifest requires 3-8
  -- non-empty strings for BOTH success_criteria and fail_conditions.
  -- 20260729062000 exists only because 3 of the 9 expansion blocks shipped
  -- violating that rule. Assert both arrays are in range from the start, so
  -- this operation can never need the same follow-up correction.
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
      and (
        jsonb_array_length(content -> 'scenario_spec' -> 'success_criteria') not between 3 and 8
        or jsonb_array_length(content -> 'scenario_spec' -> 'fail_conditions') not between 3 and 8
      )
  ) then
    raise exception 'an objections oral-check block violates the 3-8 success_criteria / fail_conditions rule the manifest validator enforces';
  end if;
end;
$$;

-- Scope fence: the insertion touched nothing outside its own 2 rows.
do $$
begin
  if (
    select count(*)
    from public.content_blocks block
    join public.lessons lesson on lesson.id = block.lesson_id
    where lesson.content_import_id = 'bmh-employee-training-v1'
  ) <> 2 then
    raise exception 'the insertion created or removed content blocks outside its own 2 target rows';
  end if;
  if (select count(*) from public.lessons where content_import_id = 'bmh-employee-training-v1') <> 2 then
    raise exception 'the insertion touched lessons outside its own 2 target lessons';
  end if;
end;
$$;

-- Assert the receipt row: exact hashes, mutation count, and evidence.
do $$
declare
  v_receipt public.content_import_oral_check_objections_role_play_records%rowtype;
begin
  select * into v_receipt
  from public.content_import_oral_check_objections_role_play_records
  where import_id = 'bmh-employee-training-v1';
  if not found then
    raise exception 'no receipt row was written for the successful insertion';
  end if;
  if v_receipt.prior_catalog_sha256 <> '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95' then
    raise exception 'receipt prior_catalog_sha256 mismatch: %', v_receipt.prior_catalog_sha256;
  end if;
  if v_receipt.replacement_catalog_sha256 <> repeat('f', 64) then
    raise exception 'receipt replacement_catalog_sha256 mismatch: %', v_receipt.replacement_catalog_sha256;
  end if;
  -- The load-bearing cross-check: the payload hash the function computed at
  -- runtime from its own inline v_mutations must equal the literal pinned
  -- into fn_guard_imported_content_block_insert_v1's objections branch. If
  -- a single character of the block content ever changes without the guard
  -- literal being recomputed, this fails.
  if v_receipt.database_payload_sha256 <> '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016' then
    raise exception 'receipt database_payload_sha256 does not match the hash pinned into the content_blocks insert guard: %', v_receipt.database_payload_sha256;
  end if;
  if v_receipt.role_play_insert_count <> 2 then
    raise exception 'receipt role_play_insert_count mismatch: %', v_receipt.role_play_insert_count;
  end if;
  if jsonb_array_length(v_receipt.mutations) <> 2 then
    raise exception 'receipt mutations array length mismatch: %', jsonb_array_length(v_receipt.mutations);
  end if;
  if v_receipt.evidence -> 'lesson_source_keys' <> jsonb_build_array(
    'lesson-content-slot-09', 'lesson-content-slot-10'
  ) then
    raise exception 'receipt evidence.lesson_source_keys mismatch: %', v_receipt.evidence;
  end if;
end;
$$;

-- The session markers the function set are cleared again on the way out --
-- a successful run must not leave a live insert capability behind in the
-- caller's session.
do $$
begin
  if coalesce(current_setting('bmh.oral_check_objections_import_id', true), '') <> ''
    or coalesce(current_setting('bmh.oral_check_objections_payload_sha256', true), '') <> ''
  then
    raise exception 'the successful insertion left its guard markers set in the session';
  end if;
end;
$$;

-- The real permanent one-shot refusal on a genuine second invocation --
-- not a simulated evidence row like the "retry-after-drift" section above.
do $$
begin
  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'a genuine second invocation after a real successful first insertion was not refused';
  exception when sqlstate '40001' then
    if sqlerrm not like '%this one-shot operation has already been performed%' then raise; end if;
  end;
  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused genuine second invocation changed the row count';
  end if;
  if (select count(*) from public.content_import_oral_check_objections_role_play_records
      where import_id = 'bmh-employee-training-v1') <> 1 then
    raise exception 'the refused genuine second invocation changed the receipt count';
  end if;
end;
$$;

rollback to savepoint oral_check_objections_success_rehearsal;

rollback;
