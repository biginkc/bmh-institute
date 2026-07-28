-- Exercises fn_revise_released_content_blocks_v2 and
-- fn_rollback_released_content_block_revision_v1 through full multi-row
-- fixtures for every branch, including ones an adversarial review of an
-- earlier version of this migration flagged:
--   1. the ledger is SHARED with the quiz-revision mechanism (no per-kind
--      fork) -- proven by seeding a synthetic quiz-kind revision row first
--      and confirming this mechanism picks up its revision number and
--      manifest as the active baseline, not its own independent "revision 1";
--   2. the required confirmation string is bound to a checksum PostgreSQL
--      computes itself from the mutation payload, not a caller assertion;
--   3. rollback locks and checks every table that can hold learner activity
--      against a touched block (not just role_play_results), refusing if any
--      of them reference an inserted OR an updated block;
--   4. 'flashcard' is accepted end to end through the real RPC, not just the
--      TS-side type allow-list.
-- Also still covers: a stale-preflight retry, an idempotent replay, and a
-- second independent revision proving the mechanism is genuinely reusable.
--
-- Deliberately uses an import_id OTHER than bmh-employee-training-v1 to prove
-- the mechanism carries no hardcoded identity, count, or checksum pin.

begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if to_regprocedure(
    'public.fn_revise_released_content_blocks_v2(text,text,text,text,jsonb,text,jsonb,text)'
  ) is null then
    raise exception 'versioned content block revision function is absent';
  end if;
  if to_regprocedure(
    'public.fn_rollback_released_content_block_revision_v1(text,integer,jsonb,text)'
  ) is null then
    raise exception 'versioned content block revision rollback function is absent';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_import_release_revisions'
      and column_name in ('kind', 'mutation_count', 'mutations', 'prior_block_graph')
    having count(*) = 4
  ) then
    raise exception 'content_import_release_revisions was not generalized for content-block revisions';
  end if;
end;
$$;

-- Cheap, fixture-free refusals: these all fire before any release lookup.
do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), '[]'::jsonb, repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'authenticated caller revised content blocks';
  exception when sqlstate '42501' then
    if sqlerrm not like '%requires service_role%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'Not-A-Valid-Import-Id', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), '[{}]'::jsonb, repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'malformed import_id was accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid import_id%' then raise; end if;
  end;

  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', 'not-hex', repeat('2', 64),
      repeat('3', 64), '[{}]'::jsonb, repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'malformed checksum was accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid checksum shape%' then raise; end if;
  end;

  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64), '[]'::jsonb, repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'an empty mutation array was accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%non-empty array of at most 500 rows%' then raise; end if;
  end;

  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64),
      (select jsonb_agg('{}'::jsonb) from generate_series(1, 501)),
      repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'a 501-row mutation array was accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%non-empty array of at most 500 rows%' then raise; end if;
  end;

  -- A shape-valid mutation (so this actually reaches the evidence check
  -- instead of being refused earlier for shape reasons) with empty evidence.
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64),
      jsonb_build_array(jsonb_build_object(
        'action', 'insert', 'source_key', 'block-cheap-check',
        'block_id', '00000000-0000-5000-a000-000000000099',
        'lesson_id', '00000000-0000-5000-a000-000000000098',
        'block_type', 'text', 'expected_content', null,
        'replacement_content', '{"html":"<p>x</p>"}'::jsonb,
        'sort_order', 0, 'is_required_for_completion', false,
        'replacement_sha256', null, 'replacement_size_bytes', null
      )),
      repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'empty evidence passed the checksum-bound evidence gate';
  exception when sqlstate '22023' then
    if sqlerrm not like '%checksum-bound evidence is incomplete%' then raise; end if;
  end;
end;
$$;

-- Full fixture: a published program/course/module with two lessons. Lesson
-- one already carries a text block (revision 3 will update it) and a
-- flashcard block (revision 4 will update it, proving 'flashcard' is
-- accepted end to end, not just by the TS-side allow-list). Lesson two
-- starts empty; revision 3 inserts two role-play blocks into it, and
-- revision 4 inserts a third and updates one of the first two -- proving the
-- mechanism replays for a second, independently-shaped payload rather than
-- being usable exactly once.
select set_config('bmh.apply_import_id', 'test-content-block-revision-v2', true);
insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
values (
  '05500000-0000-5000-a000-000000000001', 'Migration 055 revision program',
  'test-content-block-revision-v2', false, true
);
insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
values (
  '05500000-0000-5000-a000-000000000002', 'Migration 055 revision course',
  'test-content-block-revision-v2', false, false
);
insert into public.program_courses (id, program_id, course_id, sort_order)
values (
  '05500000-0000-5000-a000-000000000003',
  '05500000-0000-5000-a000-000000000001',
  '05500000-0000-5000-a000-000000000002',
  1
);
insert into public.modules (id, course_id, title, sort_order)
values (
  '05500000-0000-5000-a000-000000000004',
  '05500000-0000-5000-a000-000000000002',
  'Migration 055 revision module', 1
);
insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id)
values
  (
    '05500000-0000-5000-a000-000000000005',
    '05500000-0000-5000-a000-000000000004',
    'Migration 055 lesson one (update targets)', 'content', 1,
    'test-content-block-revision-v2'
  ),
  (
    '05500000-0000-5000-a000-000000000006',
    '05500000-0000-5000-a000-000000000004',
    'Migration 055 lesson two (insert targets)', 'content', 2,
    'test-content-block-revision-v2'
  );
insert into public.content_blocks (
  id, lesson_id, block_type, content, sort_order, is_required_for_completion
) values
  (
    '05500000-0000-5000-a000-000000000007',
    '05500000-0000-5000-a000-000000000005',
    'text', '{"html":"<p>Original A</p>"}'::jsonb, 1, false
  ),
  (
    '05500000-0000-5000-a000-000000000008',
    '05500000-0000-5000-a000-000000000005',
    'flashcard', '{"cards":[{"front":"BMH","back":"Better Made Homes"}]}'::jsonb, 2, false
  );
select set_config('bmh.apply_import_id', '', true);

select set_config('bmh.release_import_id', 'test-content-block-revision-v2', true);
insert into public.content_import_release_records (
  import_id, program_id, qa_role_group_id, employee_role_group_id,
  manifest_sha256, reconciliation_sha256, catalog_sha256,
  rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
  admin_happy_path_sha256, approval_sha256, approved_by, evidence
) values (
  'test-content-block-revision-v2',
  '05500000-0000-5000-a000-000000000001',
  '05500000-0000-5000-a000-000000000010',
  '05500000-0000-5000-a000-000000000011',
  repeat('1', 64), repeat('2', 64),
  public.fn_course_import_catalog_sha256('test-content-block-revision-v2'),
  repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
  repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
);
update public.programs set is_published = true
where content_import_id = 'test-content-block-revision-v2';
update public.courses set is_published = true
where content_import_id = 'test-content-block-revision-v2';
select set_config('bmh.release_import_id', '', true);

-- Revision 2 (a fixture, not a real quiz revision -- the real quiz-revision
-- RPC is hardcoded to bmh-employee-training-v1's exact 19-quiz/920-question
-- shape and cannot run against a lightweight test fixture): seeds the SHARED
-- ledger with a quiz-kind row exactly as the real quiz-revision mechanism
-- would, to prove the content-block mechanism reads the shared active-state
-- view rather than forking its own independent numbering. If this migration
-- regressed to a per-kind ledger, the assertions below (expecting revision 3
-- with prior_manifest = this row's manifest, not the original release's)
-- would fail.
do $$
declare
  v_catalog text := public.fn_course_import_catalog_sha256('test-content-block-revision-v2');
begin
  perform set_config('bmh.release_revision_import_id', 'test-content-block-revision-v2', true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence
  ) values (
    'test-content-block-revision-v2', 2, 'quiz',
    repeat('1', 64), repeat('9', 64),
    v_catalog, v_catalog, repeat('f', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  if (
    select active_revision from public.content_import_active_release_v1
    where import_id = 'test-content-block-revision-v2'
  ) <> 2 then
    raise exception 'the shared active-state view did not pick up the quiz-kind fixture row';
  end if;
  if (
    select active_manifest_sha256 from public.content_import_active_release_v1
    where import_id = 'test-content-block-revision-v2'
  ) <> repeat('9', 64) then
    raise exception 'the shared active-state view did not surface the quiz-kind row''s manifest';
  end if;
end;
$$;

-- Revision 3 (the content-block mechanism's first use for this import): two
-- updates (one text, one flashcard) + two inserts. Its prior-manifest input
-- is repeat('9', 64) -- the QUIZ fixture row's manifest from revision 2, not
-- the original release's repeat('1', 64) -- which only succeeds if this
-- mechanism is reading the shared ledger, proving no fork.
do $$
declare
  v_prior_manifest text := repeat('9', 64);
  v_manifest text := repeat('2', 64);
  v_prior_catalog text;
  v_client_payload text := repeat('7', 64);
  v_mutations jsonb;
  v_database_payload text;
  v_evidence jsonb;
  v_confirmation text;
  v_result jsonb;
begin
  v_prior_catalog := public.fn_course_import_catalog_sha256('test-content-block-revision-v2');
  v_mutations := jsonb_build_array(
    jsonb_build_object(
      'action', 'update', 'source_key', 'block-test-a',
      'block_id', '05500000-0000-5000-a000-000000000007',
      'lesson_id', '05500000-0000-5000-a000-000000000005',
      'block_type', 'text',
      'expected_content', '{"html":"<p>Original A</p>"}'::jsonb,
      'replacement_content', '{"html":"<p>Revised A</p>"}'::jsonb,
      'sort_order', 1, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    ),
    jsonb_build_object(
      'action', 'insert', 'source_key', 'block-oral-check-test-1',
      'block_id', '05500000-0000-5000-a000-000000000009',
      'lesson_id', '05500000-0000-5000-a000-000000000006',
      'block_type', 'role_play', 'expected_content', null,
      'replacement_content', jsonb_build_object(
        'mode', 'oral_check', 'scenario_id', 'pending:oral-check-test-1',
        'title', 'Talk with Andrea: Test One', 'height_px', 760
      ),
      'sort_order', 1, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    ),
    jsonb_build_object(
      'action', 'insert', 'source_key', 'block-oral-check-test-2',
      'block_id', '05500000-0000-5000-a000-00000000000a',
      'lesson_id', '05500000-0000-5000-a000-000000000006',
      'block_type', 'role_play', 'expected_content', null,
      'replacement_content', jsonb_build_object(
        'mode', 'oral_check', 'scenario_id', 'pending:oral-check-test-2',
        'title', 'Talk with Andrea: Test Two', 'height_px', 760
      ),
      'sort_order', 2, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    )
  );
  v_database_payload := encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex');
  v_evidence := jsonb_build_object(
    'operation', 'released_content_blocks_v2',
    'manifest_sha256', v_manifest,
    'expected_prior_catalog_sha256', v_prior_catalog
  );
  v_confirmation := 'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
    || v_prior_manifest || ':' || v_manifest || ':' || v_prior_catalog || ':'
    || v_database_payload || ':3';

  -- A confirmation built from the CALLER's own client-side hash instead of
  -- PostgreSQL's own computed digest must be refused -- this is the direct
  -- regression test for "confirmation bound to a caller assertion" rather
  -- than a checksum the database itself verifies.
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', v_prior_manifest, v_manifest,
      v_prior_catalog, v_mutations, v_client_payload, v_evidence,
      'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
        || v_prior_manifest || ':' || v_manifest || ':' || v_prior_catalog || ':'
        || v_client_payload || ':3'
    );
    raise exception 'a confirmation bound to the caller-supplied client hash was accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%confirmation mismatch%' then raise; end if;
  end;

  -- A stale prior-catalog checksum (as if the caller preflighted before some
  -- unrelated catalog change) must be refused, not silently overwritten.
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', v_prior_manifest, v_manifest,
      repeat('6', 64), v_mutations, v_client_payload,
      jsonb_set(v_evidence, '{expected_prior_catalog_sha256}', to_jsonb(repeat('6', 64))),
      'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
        || v_prior_manifest || ':' || v_manifest || ':' || repeat('6', 64) || ':'
        || v_database_payload || ':3'
    );
    raise exception 'a stale prior-catalog checksum was accepted';
  exception when sqlstate '40001' then
    if sqlerrm not like '%catalog drifted from the exact preflight checksum%' then raise; end if;
  end;

  -- Now the real forward revision.
  v_result := public.fn_revise_released_content_blocks_v2(
    'test-content-block-revision-v2', v_prior_manifest, v_manifest,
    v_prior_catalog, v_mutations, v_client_payload, v_evidence, v_confirmation
  );
  if v_result ->> 'status' <> 'revised'
    or (v_result ->> 'revision')::int <> 3
    or (v_result ->> 'mutation_count')::int <> 3
    or (v_result ->> 'update_count')::int <> 1
    or (v_result ->> 'insert_count')::int <> 2
    or v_result ->> 'database_payload_sha256' <> v_database_payload
  then
    raise exception 'revision 3 returned an unexpected receipt: %', v_result;
  end if;

  if (
    select content from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000007'
  ) <> '{"html":"<p>Revised A</p>"}'::jsonb then
    raise exception 'revision 3 did not apply the update to block A';
  end if;
  if not exists (
    select 1 from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000009'
      and block_type = 'role_play'
      and content ->> 'mode' = 'oral_check'
  ) then
    raise exception 'revision 3 did not insert the first oral-check block';
  end if;
  if (select count(*) from public.content_blocks
      where lesson_id = '05500000-0000-5000-a000-000000000006') <> 2 then
    raise exception 'revision 3 inserted the wrong number of blocks into lesson two';
  end if;

  -- Idempotent replay: the exact same target manifest must return
  -- already_revised rather than re-mutating or erroring.
  v_result := public.fn_revise_released_content_blocks_v2(
    'test-content-block-revision-v2', v_prior_manifest, v_manifest,
    v_prior_catalog, v_mutations, v_client_payload, v_evidence, v_confirmation
  );
  if v_result ->> 'status' <> 'already_revised' or (v_result ->> 'revision')::int <> 3 then
    raise exception 'replaying revision 3 did not return already_revised: %', v_result;
  end if;
  if (select count(*) from public.content_import_release_revisions
      where import_id = 'test-content-block-revision-v2' and kind = 'content_blocks') <> 1 then
    raise exception 'replaying revision 3 wrote a duplicate audit row';
  end if;

  -- A caller stuck on the pre-revision-3 preflight (stale prior manifest)
  -- attempting a DIFFERENT next change must be refused, not merged in. Build
  -- a CORRECT confirmation for this different payload so the refusal is
  -- unambiguously the "stale prior manifest" branch, not a confirmation
  -- shape mismatch.
  declare
    v_stale_mutations jsonb := jsonb_build_array(jsonb_build_object(
      'action', 'update', 'source_key', 'block-test-a',
      'block_id', '05500000-0000-5000-a000-000000000007',
      'lesson_id', '05500000-0000-5000-a000-000000000005',
      'block_type', 'text',
      'expected_content', '{"html":"<p>Revised A</p>"}'::jsonb,
      'replacement_content', '{"html":"<p>Stale attempt</p>"}'::jsonb,
      'sort_order', 1, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    ));
    v_stale_database_payload text :=
      encode(sha256(convert_to(v_stale_mutations::text, 'UTF8')), 'hex');
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', v_prior_manifest, repeat('3', 64),
      v_prior_catalog, v_stale_mutations, repeat('b', 64),
      jsonb_build_object(
        'operation', 'released_content_blocks_v2',
        'manifest_sha256', repeat('3', 64),
        'expected_prior_catalog_sha256', v_prior_catalog
      ),
      'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
        || v_prior_manifest || ':' || repeat('3', 64) || ':' || v_prior_catalog || ':'
        || v_stale_database_payload || ':1'
    );
    raise exception 'a stale-preflight retry against a superseded manifest was accepted';
  exception when sqlstate '40001' then
    if sqlerrm not like '%active manifest changed after preflight%' then raise; end if;
  end;
end;
$$;

-- Revision 4: proves the mechanism is reusable for a second, differently
-- shaped payload (one role-play update, one role-play insert, one flashcard
-- update -- flashcard end to end through the real RPC, not just the TS
-- allow-list).
do $$
declare
  v_prior_manifest text := repeat('2', 64);
  v_manifest text := repeat('3', 64);
  v_prior_catalog text;
  v_client_payload text := repeat('8', 64);
  v_mutations jsonb;
  v_database_payload text;
  v_evidence jsonb;
  v_confirmation text;
  v_result jsonb;
begin
  v_prior_catalog := public.fn_course_import_catalog_sha256('test-content-block-revision-v2');
  v_mutations := jsonb_build_array(
    jsonb_build_object(
      'action', 'update', 'source_key', 'block-oral-check-test-1',
      'block_id', '05500000-0000-5000-a000-000000000009',
      'lesson_id', '05500000-0000-5000-a000-000000000006',
      'block_type', 'role_play',
      'expected_content', jsonb_build_object(
        'mode', 'oral_check', 'scenario_id', 'pending:oral-check-test-1',
        'title', 'Talk with Andrea: Test One', 'height_px', 760
      ),
      'replacement_content', jsonb_build_object(
        'mode', 'oral_check', 'scenario_id', 'pending:oral-check-test-1',
        'title', 'Talk with Andrea: Real Estate Terms Glossary', 'height_px', 760
      ),
      'sort_order', 1, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    ),
    jsonb_build_object(
      'action', 'update', 'source_key', 'block-cards',
      'block_id', '05500000-0000-5000-a000-000000000008',
      'lesson_id', '05500000-0000-5000-a000-000000000005',
      'block_type', 'flashcard',
      'expected_content', '{"cards":[{"front":"BMH","back":"Better Made Homes"}]}'::jsonb,
      'replacement_content',
        '{"cards":[{"front":"BMH","back":"Better Made Homes, revised"}]}'::jsonb,
      'sort_order', 2, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    ),
    jsonb_build_object(
      'action', 'insert', 'source_key', 'block-oral-check-test-3',
      'block_id', '05500000-0000-5000-a000-00000000000b',
      'lesson_id', '05500000-0000-5000-a000-000000000006',
      'block_type', 'role_play', 'expected_content', null,
      'replacement_content', jsonb_build_object(
        'mode', 'oral_check', 'scenario_id', 'pending:oral-check-test-3',
        'title', 'Talk with Andrea: Test Three', 'height_px', 760
      ),
      'sort_order', 3, 'is_required_for_completion', false,
      'replacement_sha256', null, 'replacement_size_bytes', null
    )
  );
  v_database_payload := encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex');
  v_evidence := jsonb_build_object(
    'operation', 'released_content_blocks_v2',
    'manifest_sha256', v_manifest,
    'expected_prior_catalog_sha256', v_prior_catalog
  );
  v_confirmation := 'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
    || v_prior_manifest || ':' || v_manifest || ':' || v_prior_catalog || ':'
    || v_database_payload || ':3';

  v_result := public.fn_revise_released_content_blocks_v2(
    'test-content-block-revision-v2', v_prior_manifest, v_manifest,
    v_prior_catalog, v_mutations, v_client_payload, v_evidence, v_confirmation
  );
  if v_result ->> 'status' <> 'revised' or (v_result ->> 'revision')::int <> 4 then
    raise exception 'revision 4 returned an unexpected receipt: %', v_result;
  end if;
  if (select count(*) from public.content_blocks
      where lesson_id = '05500000-0000-5000-a000-000000000006') <> 3 then
    raise exception 'revision 4 did not insert its new block';
  end if;
  if (
    select content from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000008'
  ) <> '{"cards":[{"front":"BMH","back":"Better Made Homes, revised"}]}'::jsonb then
    raise exception 'revision 4 did not apply the flashcard update end to end through the RPC';
  end if;
end;
$$;

-- Rollback refusal once learner activity exists on a touched block --
-- checked against TWO different progress tables (role_play_results for the
-- inserted block, user_block_progress for the updated flashcard block) to
-- prove the broadened check, not just the one table an earlier version of
-- this migration checked.
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '05500000-0000-5000-a000-0000000000f0',
    'authenticated', 'authenticated',
    'migration-055-learner@bmh.invalid',
    crypt('Migration055Acceptance!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 055 learner"}'::jsonb, now(), now()
  );

  insert into public.role_play_results (
    id, user_id, block_id, scenario_id, attempt_id, score, goals_met, summary
  ) values (
    '05500000-0000-5000-a000-0000000000f1',
    '05500000-0000-5000-a000-0000000000f0',
    '05500000-0000-5000-a000-00000000000b',
    'pending:oral-check-test-3', 'attempt-055', 90, '{}'::jsonb, '{}'::jsonb
  );
  begin
    perform public.fn_rollback_released_content_block_revision_v1(
      'test-content-block-revision-v2', 4,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:4:'
        || repeat('3', 64) || ':' || repeat('2', 64) || ':' || repeat('e', 64)
    );
    raise exception 'rollback proceeded despite role_play_results activity on the inserted block';
  exception when sqlstate '23503' then
    if sqlerrm not like '%learner activity exists on a touched block%' then raise; end if;
  end;
  delete from public.role_play_results
  where id = '05500000-0000-5000-a000-0000000000f1';

  insert into public.user_block_progress (id, user_id, block_id) values (
    '05500000-0000-5000-a000-0000000000f3',
    '05500000-0000-5000-a000-0000000000f0',
    '05500000-0000-5000-a000-000000000008'
  );
  begin
    perform public.fn_rollback_released_content_block_revision_v1(
      'test-content-block-revision-v2', 4,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:4:'
        || repeat('3', 64) || ':' || repeat('2', 64) || ':' || repeat('e', 64)
    );
    raise exception 'rollback proceeded despite user_block_progress activity on an updated block';
  exception when sqlstate '23503' then
    if sqlerrm not like '%learner activity exists on a touched block%' then raise; end if;
  end;
  delete from public.user_block_progress
  where id = '05500000-0000-5000-a000-0000000000f3';
  -- Marking a block's progress has a real side effect: trg_user_block_progress_after_insert
  -- (migration 002) advances the learner's user_course_resume pointer to it.
  -- Deleting the progress row alone does not undo that pointer, so clear it
  -- too or the next (legitimate) rollback would correctly, but confusingly
  -- for this test, refuse on account of this test's own fixture residue.
  delete from public.user_course_resume
  where user_id = '05500000-0000-5000-a000-0000000000f0';
end;
$$;

-- Rollback stale-revision refusal, then the real rollback of revision 4,
-- restoring exactly revision 3's state.
do $$
declare
  v_confirmation text;
  v_result jsonb;
  v_catalog_after_revision_3 text;
begin
  select catalog_sha256 into v_catalog_after_revision_3
  from public.content_import_release_revisions
  where import_id = 'test-content-block-revision-v2' and revision = 3 and kind = 'content_blocks';

  -- Revision 3 genuinely existed, but revision 4 has since superseded it.
  -- A CORRECTLY built confirmation for revision 3 must still be refused --
  -- by the catalog compare-and-swap, since live state now reflects
  -- revision 4, not the "not found" branch (that is covered separately
  -- below for a revision number/kind that never matches at all).
  begin
    perform public.fn_rollback_released_content_block_revision_v1(
      'test-content-block-revision-v2', 3,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:3:'
        || repeat('2', 64) || ':' || repeat('9', 64) || ':' || repeat('e', 64)
    );
    raise exception 'rollback against a superseded revision was accepted';
  exception when sqlstate '40001' then
    if sqlerrm not like '%catalog changed after the recorded revision%' then raise; end if;
  end;

  -- Rollback must also refuse to treat the quiz-kind revision 2 fixture row
  -- as a rollback-able content-block revision.
  begin
    perform public.fn_rollback_released_content_block_revision_v1(
      'test-content-block-revision-v2', 2,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'wrong-confirmation'
    );
    raise exception 'rollback accepted a quiz-kind revision as a content-block revision';
  exception when sqlstate '40001' then
    if sqlerrm not like '%active revision changed after preflight%' then raise; end if;
  end;

  v_confirmation := 'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:4:'
    || repeat('3', 64) || ':' || repeat('2', 64) || ':' || repeat('e', 64);
  v_result := public.fn_rollback_released_content_block_revision_v1(
    'test-content-block-revision-v2', 4,
    jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
    v_confirmation
  );
  if v_result ->> 'status' <> 'rolled_back'
    or (v_result ->> 'revision')::int <> 5
    or v_result ->> 'catalog_sha256' <> v_catalog_after_revision_3
  then
    raise exception 'rollback returned an unexpected receipt: %', v_result;
  end if;

  if exists (
    select 1 from public.content_blocks
    where id = '05500000-0000-5000-a000-00000000000b'
  ) then
    raise exception 'rollback did not remove the block revision 4 inserted';
  end if;
  if (
    select content ->> 'title' from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000009'
  ) <> 'Talk with Andrea: Test One' then
    raise exception 'rollback did not restore the role-play block revision 4 updated';
  end if;
  if (
    select content from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000008'
  ) <> '{"cards":[{"front":"BMH","back":"Better Made Homes"}]}'::jsonb then
    raise exception 'rollback did not restore the flashcard block revision 4 updated';
  end if;

  if (
    select active_revision from public.content_import_active_release_v1
    where import_id = 'test-content-block-revision-v2'
  ) <> 5 then
    raise exception 'active-revision view did not advance past the rollback';
  end if;
end;
$$;

-- Direct insert-guard trigger checks, mirroring migration 054's structure but
-- for the new v2 branch: no marker is refused; a well-formed v2 marker for a
-- published release is accepted regardless of the specific payload hash
-- (the real gate is that only fn_revise_released_content_blocks_v2 itself
-- ever sets these session variables, after its own exhaustive validation).
do $$
begin
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '05500000-0000-5000-a000-0000000000f2',
      '05500000-0000-5000-a000-000000000005',
      'text', '{"html":"<p>Unmarked insert</p>"}'::jsonb, 9, false
    );
    raise exception 'an unmarked direct insert into an imported lesson was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;

  perform set_config('bmh.revise_content_blocks_v2_import_id', 'test-content-block-revision-v2', true);
  perform set_config('bmh.revise_content_blocks_v2_payload_sha256', 'not-hex', true);
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '05500000-0000-5000-a000-0000000000f2',
      '05500000-0000-5000-a000-000000000005',
      'text', '{"html":"<p>Malformed marker insert</p>"}'::jsonb, 9, false
    );
    raise exception 'a malformed v2 payload marker was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then raise; end if;
  end;

  perform set_config(
    'bmh.revise_content_blocks_v2_payload_sha256',
    encode(sha256('proof-of-format'::bytea), 'hex'),
    true
  );
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  ) values (
    '05500000-0000-5000-a000-0000000000f2',
    '05500000-0000-5000-a000-000000000005',
    'text', '{"html":"<p>Marked insert</p>"}'::jsonb, 9, false
  );
  perform set_config('bmh.revise_content_blocks_v2_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_v2_payload_sha256', '', true);

  if not exists (
    select 1 from public.content_blocks
    where id = '05500000-0000-5000-a000-0000000000f2'
  ) then
    raise exception 'the marked v2 direct insert unexpectedly did not persist';
  end if;
end;
$$;

-- Ledger immutability, mirroring migration 054's audit-table guard checks --
-- this now targets the shared content_import_release_revisions table.
do $$
begin
  begin
    update public.content_import_release_revisions
    set evidence = '{"changed":true}'::jsonb
    where import_id = 'test-content-block-revision-v2' and revision = 3;
    raise exception 'the shared revision ledger was mutable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;

  begin
    delete from public.content_import_release_revisions
    where import_id = 'test-content-block-revision-v2' and revision = 3;
    raise exception 'the shared revision ledger was deletable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable%' then raise; end if;
  end;

  begin
    insert into public.content_import_release_revisions (
      import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
      prior_catalog_sha256, catalog_sha256, payload_sha256, client_payload_sha256,
      download_evidence_sha256, mutation_count, update_count, insert_count,
      mutations, prior_block_graph, evidence
    ) values (
      'test-content-block-revision-v2', 99, 'content_blocks',
      repeat('1', 64), repeat('2', 64),
      repeat('3', 64), repeat('4', 64), repeat('5', 64), repeat('6', 64),
      repeat('c', 64),
      1, 1, 0, '[{"fixture":true}]'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
    raise exception 'a direct ledger insert without the operation marker was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%evidence-bound revision operation%' then raise; end if;
  end;
end;
$$;

rollback;
