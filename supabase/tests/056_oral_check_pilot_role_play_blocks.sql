begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- Structural: the function and its evidence table must exist, with the
-- exact-count check constraints this one-shot operation depends on.
do $$
begin
  if to_regprocedure(
    'public.fn_insert_oral_check_pilot_role_play_blocks()'
  ) is null then
    raise exception 'oral-check pilot role-play insertion function is absent';
  end if;
  if to_regclass(
    'public.content_import_oral_check_pilot_role_play_records'
  ) is null then
    raise exception 'oral-check pilot role-play insertion audit table is absent';
  end if;
end;
$$;

-- Proves this migration's fn_guard_imported_content_block_insert_v1
-- extension is being exercised against the ACTUAL current state of main
-- tonight, not a hypothetical post-#128 state: PR #128
-- (claude/versioned-content-block-revision-v2) is parked, unmerged, and
-- introduces a WHOLESALE NEW fn_guard_imported_content_block_insert_v2
-- that the content_blocks insert trigger would call INSTEAD of v1 once
-- merged -- see this migration's header comment for what changes then.
-- v2 must not exist here.
do $$
begin
  if to_regprocedure(
    'public.fn_guard_imported_content_block_insert_v2()'
  ) is not null then
    raise exception 'fn_guard_imported_content_block_insert_v2 exists -- this test environment is no longer "current main without #128", the header comment''s handoff note applies and this test suite needs updating';
  end if;
end;
$$;

-- Authorization: only service_role may run this.
do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_insert_oral_check_pilot_role_play_blocks();
    raise exception 'authenticated caller ran the oral-check pilot insertion';
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
    perform public.fn_insert_oral_check_pilot_role_play_blocks();
    raise exception 'the insertion ran with no release record for bmh-employee-training-v1 at all';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact published release lineage was not found%' then raise; end if;
  end;
  if exists (
    select 1 from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) then
    raise exception 'the refused insertion left content blocks behind';
  end if;
end;
$$;

-- A minimal published release for the same import_id (structurally real,
-- but a fresh local database can never reproduce production's EXACT
-- 44-block, 19-lesson catalog byte-for-byte, so its computed live hash can
-- never equal the hardcoded production hash pin -- see the migration's
-- header comment). This proves the fail-closed CAS check itself: a
-- production-shaped release that is NOT the exact expected state must
-- still refuse, never silently insert against a mismatched assumption.
--
-- Wrapped in its own savepoint: content_import_release_records is
-- guarded against UPDATE/DELETE unconditionally (immutable evidence, by
-- design -- see fn_guard_content_import_release_record), so the only way
-- to free up the 'bmh-employee-training-v1' import_id primary key for the
-- genuine-success rehearsal further down this file is a transaction-level
-- rollback, not a DML statement.
savepoint before_catalog_mismatch_fixture;
do $$
declare
  v_program_id uuid := '05600000-0000-5000-a000-000000000001';
  v_course_id uuid := '05600000-0000-5000-a000-000000000002';
begin
  perform set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Local Oral-Check Preflight Fixture', 'bmh-employee-training-v1', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Local Oral-Check Preflight Course', 'bmh-employee-training-v1', false, false);
  perform set_config('bmh.apply_import_id', '', true);

  perform set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'bmh-employee-training-v1', v_program_id,
    '05600000-0000-5000-a000-000000000003', '05600000-0000-5000-a000-000000000004',
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);

  begin
    perform public.fn_insert_oral_check_pilot_role_play_blocks();
    raise exception 'the insertion ran against a local fixture whose catalog cannot match the hardcoded production hash pin';
  exception when sqlstate '40001' then
    if sqlerrm not like '%catalog drifted from the exact production preflight%' then raise; end if;
  end;
  if exists (
    select 1 from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) then
    raise exception 'the refused insertion left content blocks behind on catalog mismatch';
  end if;
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'the refused insertion left an evidence row behind';
  end if;
end;
$$;

-- The content_blocks insert guard's other branches are untouched: an
-- ordinary, unmarked insert into an imported lesson (any lesson at all,
-- not just the 3 pilot targets) must still be refused exactly as before.
-- (Still inside before_catalog_mismatch_fixture's scope: reuses that
-- section's course_id.)
do $$
declare
  v_module_id uuid := '05600000-0000-5000-a000-000000000005';
  v_lesson_id uuid := '05600000-0000-5000-a000-000000000006';
begin
  perform set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);
  insert into public.modules (id, course_id, title, sort_order)
  values (v_module_id, '05600000-0000-5000-a000-000000000002', 'Guard Regression Module', 1);
  insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id)
  values (v_lesson_id, v_module_id, 'Guard Regression Lesson', 'content', 1, 'bmh-employee-training-v1');
  perform set_config('bmh.apply_import_id', '', true);

  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '05600000-0000-5000-a000-000000000007', v_lesson_id, 'text',
      '{"html":"<p>Unmarked</p>"}'::jsonb, 1, false
    );
    raise exception 'an unmarked direct insert into an imported lesson was accepted after extending the guard';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;
end;
$$;

-- The evidence table's own guard: nobody may insert directly, even
-- service_role, without the exact marker + payload hash the function sets.
do $$
begin
  begin
    insert into public.content_import_oral_check_pilot_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), 3, '[1,2,3]'::jsonb, '{}'::jsonb
    );
    raise exception 'a direct unmarked insert into the evidence table was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;
end;
$$;

-- The evidence table's exact-count check constraints: this table exists
-- SPECIFICALLY because content_import_released_content_block_revision_records's
-- own constraints (role_play_insert_count = 6, mutations length = 44) can
-- never accept this operation's shape (3, 3) -- prove the reverse holds
-- too: THIS table refuses anything other than exactly 3.
do $$
begin
  alter table public.content_import_oral_check_pilot_role_play_records
    disable trigger content_import_oral_check_pilot_role_play_records_guard;
  begin
    insert into public.content_import_oral_check_pilot_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), 6, '[1,2,3,4,5,6]'::jsonb, '{}'::jsonb
    );
    raise exception 'the evidence table accepted role_play_insert_count = 6 (this table is scoped to exactly 3)';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    insert into public.content_import_oral_check_pilot_role_play_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, role_play_insert_count, mutations, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), 3, '[1]'::jsonb, '{}'::jsonb
    );
    raise exception 'the evidence table accepted a mutations array of length 1';
  exception when sqlstate '23514' then
    null;
  end;
  alter table public.content_import_oral_check_pilot_role_play_records
    enable trigger content_import_oral_check_pilot_role_play_records_guard;
end;
$$;

-- Retry-after-drift: once an evidence row exists for this import (this
-- test simulates that with the guard disabled -- the function's own first
-- successful run is what would normally create it), every subsequent
-- invocation must be refused with SQLSTATE 40001 UNCONDITIONALLY -- never
-- re-verify the live catalog and report success. An earlier version of
-- this function only re-checked the payload hash and the 3 target rows on
-- retry, which meant a completely UNRELATED later catalog edit (something
-- touching a different lesson entirely) would still make a second
-- invocation return 'already_inserted', silently implying nothing had
-- changed since the original insert when something plainly had. This
-- proves the fix: the function refuses outright, regardless of whether the
-- live catalog happens to still match anything.
do $$
begin
  alter table public.content_import_oral_check_pilot_role_play_records
    disable trigger content_import_oral_check_pilot_role_play_records_guard;
  insert into public.content_import_oral_check_pilot_role_play_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, role_play_insert_count, mutations, evidence
  ) values (
    'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64),
    '893405d59d508783cbb96bb543ab41080337fa6aa06f92a106c10962c5fcfce5',
    3, '[1,2,3]'::jsonb,
    jsonb_build_object('operation', 'oral_check_pilot_role_play_insert')
  );
  alter table public.content_import_oral_check_pilot_role_play_records
    enable trigger content_import_oral_check_pilot_role_play_records_guard;

  begin
    perform public.fn_insert_oral_check_pilot_role_play_blocks();
    raise exception 'a retry after the one-shot evidence row already existed was not refused';
  exception when sqlstate '40001' then
    if sqlerrm not like '%this one-shot operation has already been performed%' then raise; end if;
  end;

  if exists (
    select 1 from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) then
    raise exception 'the refused retry left content blocks behind';
  end if;
end;
$$;
rollback to savepoint before_catalog_mismatch_fixture;

-- Everything above proves refusal paths: no fixture, a mismatched
-- fixture, or a manually crafted evidence row bypassing the guard
-- trigger. None of it ever lets fn_insert_oral_check_pilot_role_play_blocks()
-- actually succeed and take its real INSERT / target-row-verification /
-- receipt-write path, because v_expected_prior_catalog_sha256 is hardcoded
-- to production's exact FULL catalog (44 lessons, 111 content_blocks, 920
-- questions, 3678 answer options) and reproducing that byte-for-byte in a
-- fresh local database is not practical (see the migration's header
-- comment). This closes that gap honestly instead of leaving it disclosed
-- and untested: build a fixture from the REAL production
-- program/course/module/lesson rows the pilot's 3 hardcoded mutations
-- actually target (ids and content read-only-verified against production
-- project dhvfsyteqsxagokoerrx via Supabase MCP execute_sql the same
-- session this test was written, matching content/course-manifests/
-- bmh-employee-training.v1.json's lesson-content-slot-02/-05/-16 and their
-- parent modules exactly), and stub ONLY fn_course_import_catalog_sha256 --
-- a DEPENDENCY the pilot function calls to read the live catalog hash, not
-- the pilot function itself, which runs completely unmodified below -- to
-- return the pilot's own hardcoded expected-prior-hash constant while none
-- of the 3 target blocks exist yet, and a different fixed value once they
-- do (so the function's own "hash must advance" check, which compares
-- v_replacement_catalog_sha256 against v_prior_catalog_sha256, still holds
-- for real). This proves the pilot function's actual insert / atomic
-- target-row verification / replacement-hash computation / guarded
-- receipt write end-to-end, and its real permanent one-shot refusal on a
-- genuine second invocation -- not a simulated one.
--
-- DISCLOSED SCOPE: stubbing fn_course_import_catalog_sha256 means this
-- section does NOT re-prove that the hardcoded '91bee07c...' constant
-- still matches production's CURRENT full catalog byte-for-byte -- that is
-- a separate, live, point-in-time fact (verified true immediately before
-- this PR was finalized: production project dhvfsyteqsxagokoerrx, read-only
-- via Supabase MCP execute_sql, `select public.fn_course_import_catalog_sha256(
-- 'bmh-employee-training-v1')` returned exactly '91bee07c6626d0d113291d925cfc7fa
-- 65ac26c57c7d85ea3ca172d5b706120f2' -- see the PR description), never claimed
-- to be re-verified by this test suite, and never will be without either a
-- full production-scale fixture or a live database connection.
savepoint oral_check_pilot_success_rehearsal;

-- content_import_release_records.import_id is a primary key, and the
-- table is guarded against UPDATE/DELETE unconditionally -- but the
-- "Local Oral-Check Preflight Fixture" section above already rolled back
-- to before_catalog_mismatch_fixture, so its row (and program/course) no
-- longer exist here; the import_id slot is free for this section's own
-- fixture.
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
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )
    ) then repeat('f', 64)
    else '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2'
  end;
$stub$;

-- Real production program/course/program_courses/modules/lessons (id,
-- title, and every published/order field read-only-verified against
-- production). Inserted unpublished under the apply-import marker
-- (fn_guard_imported_catalog_insert), then published via UPDATE afterward
-- -- the same two-step sequence the "Local Oral-Check Preflight Fixture"
-- section above uses.
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

  -- Real production modules that parent the 3 pilot target lessons.
  insert into public.modules (id, course_id, title, description, sort_order) values
    ('b2b26858-4b5c-5e1f-ada4-6814d3c340fe', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Orientation', 'Learn the BMH Group service standard, vocabulary, and operating tools.', 1),
    ('2cf8bd25-600c-5514-a88f-bd964bbd6616', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Who We Serve', 'Understand the sellers BMH Group can help and the tradeoffs in our offer.', 2),
    ('774aa2b9-6460-572c-a8bf-a000020fdfd5', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Performance and Career', 'Use scorecards, operating discipline, and coaching to improve and grow.', 6);

  -- The exact 3 real production lessons the pilot migration's hardcoded
  -- lesson_id values target (content/course-manifests/bmh-employee-training.v1.json
  -- lesson-content-slot-02/-05/-16).
  insert into public.lessons (
    id, module_id, title, description, lesson_type, sort_order,
    content_import_id, is_required_for_completion
  ) values
    ('dc391d4b-58f4-5a94-a97f-ca59c4d98f41', 'b2b26858-4b5c-5e1f-ada4-6814d3c340fe', 'Real Estate Terms Glossary', 'Build the vocabulary needed to follow property, title, financing, and transaction conversations without guessing.', 'content', 3, 'bmh-employee-training-v1', true),
    ('823f016f-6e4c-5791-ac42-9f24c28040df', '2cf8bd25-600c-5514-a88f-bd964bbd6616', 'The BMH Offer Playbook', 'Explain how a direct property purchase exchanges maximum retail price for speed, certainty, convenience, and an as-is sale.', 'content', 3, 'bmh-employee-training-v1', true),
    ('cccdb0ef-b907-5bce-ade1-3ff0b0d054ce', '774aa2b9-6460-572c-a8bf-a000020fdfd5', 'KPIs and Sales Telemetry', 'Read the funnel from left to right to locate process gaps and choose the right coaching response.', 'content', 1, 'bmh-employee-training-v1', true);

  perform set_config('bmh.apply_import_id', '', true);

  -- The exact published release lineage the pilot function's preflight
  -- check requires, with the SAME manifest_sha256 literal the
  -- content_blocks insert guard trigger
  -- (fn_guard_imported_content_block_insert_v1, this migration) hardcodes
  -- for the oral-check-pilot branch. Publication (is_published = true)
  -- itself is only accepted under the release marker
  -- (fn_guard_imported_catalog_publication) -- same ordering the "Local
  -- Oral-Check Preflight Fixture" section above uses: create the release
  -- record first, publish second, both under bmh.release_import_id.
  perform set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'bmh-employee-training-v1', '15a382c9-617c-5407-a880-af6303be74b2',
    '05601000-0000-5000-a000-000000000001', '05601000-0000-5000-a000-000000000002',
    '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c',
    repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('6', 64), repeat('7', 64), repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);
end;
$$;

-- The genuine first invocation: every preflight check (auth, release
-- lineage, catalog CAS) now passes for real, so this reaches the actual
-- INSERT, atomic target-row verification, replacement-hash computation,
-- and guarded receipt write -- the exact path finding 3 said was never
-- exercised.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_insert_oral_check_pilot_role_play_blocks();
  if v_result ->> 'status' <> 'inserted' then
    raise exception 'expected status=inserted, got %', v_result;
  end if;
  if v_result ->> 'import_id' <> 'bmh-employee-training-v1' then
    raise exception 'unexpected import_id in success result: %', v_result;
  end if;
  if (v_result ->> 'role_play_insert_count')::integer <> 3 then
    raise exception 'expected role_play_insert_count=3, got %', v_result;
  end if;
  if v_result ->> 'prior_catalog_sha256' <> '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2' then
    raise exception 'unexpected prior_catalog_sha256 in success result: %', v_result;
  end if;
  if v_result ->> 'catalog_sha256' <> repeat('f', 64) then
    raise exception 'unexpected replacement catalog_sha256 in success result: %', v_result;
  end if;
end;
$$;

-- Assert the exact 3 rows: id, lesson_id, content, sort_order, and
-- required flag all match the migration's hardcoded payload exactly.
do $$
begin
  if (
    select count(*) from public.content_blocks
    where (id, lesson_id, block_type, sort_order, is_required_for_completion) in (
      ('7300bba9-a9fc-582c-aa20-dd5d58754165', 'dc391d4b-58f4-5a94-a97f-ca59c4d98f41', 'role_play', 6, true),
      ('4464ecdd-2650-59ed-a525-78871e846d20', '823f016f-6e4c-5791-ac42-9f24c28040df', 'role_play', 7, true),
      ('34758403-1ddd-5e3c-a054-b2f28310d8b8', 'cccdb0ef-b907-5bce-ade1-3ff0b0d054ce', 'role_play', 6, true)
    )
  ) <> 3 then
    raise exception 'the 3 inserted rows do not exactly match the migration''s hardcoded id/lesson_id/type/sort_order/required shape';
  end if;
  if (
    select count(*) from public.content_blocks
    where id = '7300bba9-a9fc-582c-aa20-dd5d58754165'
      and content = jsonb_build_object(
        'mode', 'oral_check', 'height_px', 760,
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
  ) <> 1 then
    raise exception 'block-oral-check-slot-02 content does not byte-match the migration''s hardcoded payload';
  end if;
end;
$$;

-- Assert the receipt row: exact hashes, mutation count, and evidence.
do $$
declare
  v_receipt public.content_import_oral_check_pilot_role_play_records%rowtype;
begin
  select * into v_receipt
  from public.content_import_oral_check_pilot_role_play_records
  where import_id = 'bmh-employee-training-v1';
  if not found then
    raise exception 'no receipt row was written for the successful insertion';
  end if;
  if v_receipt.prior_catalog_sha256 <> '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2' then
    raise exception 'receipt prior_catalog_sha256 mismatch: %', v_receipt.prior_catalog_sha256;
  end if;
  if v_receipt.replacement_catalog_sha256 <> repeat('f', 64) then
    raise exception 'receipt replacement_catalog_sha256 mismatch: %', v_receipt.replacement_catalog_sha256;
  end if;
  if v_receipt.database_payload_sha256 <> '893405d59d508783cbb96bb543ab41080337fa6aa06f92a106c10962c5fcfce5' then
    raise exception 'receipt database_payload_sha256 mismatch: %', v_receipt.database_payload_sha256;
  end if;
  if v_receipt.role_play_insert_count <> 3 then
    raise exception 'receipt role_play_insert_count mismatch: %', v_receipt.role_play_insert_count;
  end if;
  if jsonb_array_length(v_receipt.mutations) <> 3 then
    raise exception 'receipt mutations array length mismatch: %', jsonb_array_length(v_receipt.mutations);
  end if;
  if v_receipt.evidence -> 'lesson_source_keys' <> jsonb_build_array(
    'lesson-content-slot-02', 'lesson-content-slot-05', 'lesson-content-slot-16'
  ) then
    raise exception 'receipt evidence.lesson_source_keys mismatch: %', v_receipt.evidence;
  end if;
end;
$$;

-- The real permanent one-shot refusal on a genuine second invocation --
-- not a simulated evidence row like the "retry-after-drift" section above.
do $$
begin
  begin
    perform public.fn_insert_oral_check_pilot_role_play_blocks();
    raise exception 'a genuine second invocation after a real successful first insertion was not refused';
  exception when sqlstate '40001' then
    if sqlerrm not like '%this one-shot operation has already been performed%' then raise; end if;
  end;
  if (select count(*) from public.content_blocks
      where id in (
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )) <> 3 then
    raise exception 'the refused genuine second invocation changed the row count';
  end if;
  if (select count(*) from public.content_import_oral_check_pilot_role_play_records
      where import_id = 'bmh-employee-training-v1') <> 1 then
    raise exception 'the refused genuine second invocation changed the receipt count';
  end if;
end;
$$;

rollback to savepoint oral_check_pilot_success_rehearsal;

rollback;
