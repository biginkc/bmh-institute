-- Exercises fn_revise_released_content_blocks_v2,
-- fn_rollback_released_content_block_revision_v1, the shared lineage helper
-- fn_current_state_revision, the quiz rollback's shared-lineage alignment,
-- and fn_backfill_v1_content_block_revisions -- all through full multi-row
-- fixtures. Coverage highlights (each added for a specific review finding):
--   * the ledger is SHARED with the quiz-revision mechanism (no per-kind
--     fork): a quiz-kind row seeds the sequence and the content mechanism
--     picks it up as the active baseline;
--   * the confirmation string binds to PostgreSQL's own payload digest;
--   * the narrowed mutation contract (insert role_play; content-only update
--     of text/flashcard) is enforced end to end through the real RPC;
--   * rollback legality derives from STATE LINEAGE, not catalog checksums:
--     with a repeated catalog state (apply B, roll back, re-apply B), the
--     stale forward receipt is refused and only the live lineage head rolls
--     back; receipts append at the end of the shared sequence (no PK
--     collision on chained rollbacks) with reverts/state-parent recorded;
--   * the chain continues through the quiz boundary (quiz rollback passes
--     its lineage gate under content receipts above it);
--   * the v1->v2 transition: seeded legacy receipts are absorbed with full
--     predecessor/catalog/identity validation, idempotently, and every
--     mismatch aborts loudly.
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
  if to_regprocedure('public.fn_current_state_revision(text)') is null then
    raise exception 'shared state-lineage helper is absent';
  end if;
  if to_regprocedure('public.fn_backfill_v1_content_block_revisions()') is null then
    raise exception 'v1 ledger backfill function is absent';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_import_release_revisions'
      and column_name in ('kind', 'mutations', 'state_parent_revision', 'reverts_revision')
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

  -- Unsupported mutation shapes are refused by the narrowed contract: an
  -- update to a role_play block and an insert of a download block are both
  -- outside (insert role_play | content-only update of text/flashcard).
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64),
      jsonb_build_array(jsonb_build_object(
        'action', 'update', 'source_key', 'block-shape-check',
        'block_id', '00000000-0000-5000-a000-000000000099',
        'lesson_id', '00000000-0000-5000-a000-000000000098',
        'block_type', 'role_play',
        'expected_content', '{"scenario_id":"a"}'::jsonb,
        'replacement_content', '{"scenario_id":"b"}'::jsonb,
        'sort_order', 0, 'is_required_for_completion', false,
        'replacement_sha256', null, 'replacement_size_bytes', null
      )),
      repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'an unsupported role_play update passed the shape gate';
  exception when sqlstate '22023' then
    if sqlerrm not like '%unsupported mutation shape%' then raise; end if;
  end;
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64),
      jsonb_build_array(jsonb_build_object(
        'action', 'insert', 'source_key', 'block-shape-check',
        'block_id', '00000000-0000-5000-a000-000000000099',
        'lesson_id', '00000000-0000-5000-a000-000000000098',
        'block_type', 'download', 'expected_content', null,
        'replacement_content', '{"file_path":"x"}'::jsonb,
        'sort_order', 0, 'is_required_for_completion', false,
        'replacement_sha256', null, 'replacement_size_bytes', null
      )),
      repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'an unsupported download insert passed the shape gate';
  exception when sqlstate '22023' then
    if sqlerrm not like '%unsupported mutation shape%' then raise; end if;
  end;

  -- A shape-valid mutation (so this reaches the evidence check instead of
  -- being refused earlier) with empty evidence.
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-content-block-revision-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64),
      jsonb_build_array(jsonb_build_object(
        'action', 'insert', 'source_key', 'block-cheap-check',
        'block_id', '00000000-0000-5000-a000-000000000099',
        'lesson_id', '00000000-0000-5000-a000-000000000098',
        'block_type', 'role_play', 'expected_content', null,
        'replacement_content', '{"scenario_id":"pending:cheap-check"}'::jsonb,
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
-- one carries a text block (revision 3 updates it) and a flashcard block
-- (revision 4 updates it -- flashcard end to end through the real RPC).
-- Lesson two starts empty; revision 3 inserts two role-play blocks into it
-- and revision 4 a third.
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

-- Revision 2 (a fixture, not a real quiz revision -- the real quiz RPC is
-- hardcoded to bmh-employee-training-v1's exact shape): seeds the SHARED
-- ledger with a quiz-kind row exactly as the real quiz mechanism would, to
-- prove the content-block mechanism reads the shared active-state view. The
-- ledger guard must auto-fill its state parent (the previous head = the
-- original release, state 1), since the unchanged quiz RPC never sets it.
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
    select state_parent_revision from public.content_import_release_revisions
    where import_id = 'test-content-block-revision-v2' and revision = 2
  ) <> 1 then
    raise exception 'the ledger guard did not auto-fill the quiz row''s state parent';
  end if;
end;
$$;

-- Revision 3 (the content-block mechanism's first use for this import): one
-- text update + two role_play inserts. Its prior-manifest input is the QUIZ
-- fixture row's manifest -- which only works if this mechanism reads the
-- shared ledger, proving no fork.
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
  -- PostgreSQL's own computed digest must be refused.
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

  -- A stale prior-catalog checksum must be refused, not silently overwritten.
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
    select state_parent_revision from public.content_import_release_revisions
    where import_id = 'test-content-block-revision-v2' and revision = 3
  ) <> 2 then
    raise exception 'revision 3 did not record the quiz fixture row as its state parent';
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
  -- attempting a DIFFERENT next change must be refused, not merged in.
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

-- Revision 4: a second, differently shaped payload (flashcard update + one
-- more role_play insert) -- reusable, and flashcard through the real RPC.
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
    || v_database_payload || ':2';

  v_result := public.fn_revise_released_content_blocks_v2(
    'test-content-block-revision-v2', v_prior_manifest, v_manifest,
    v_prior_catalog, v_mutations, v_client_payload, v_evidence, v_confirmation
  );
  if v_result ->> 'status' <> 'revised' or (v_result ->> 'revision')::int <> 4 then
    raise exception 'revision 4 returned an unexpected receipt: %', v_result;
  end if;
  if (
    select state_parent_revision from public.content_import_release_revisions
    where import_id = 'test-content-block-revision-v2' and revision = 4
  ) <> 3 then
    raise exception 'revision 4 did not record revision 3 as its state parent';
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
-- inserted block, user_block_progress for the updated flashcard block).
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
  -- Marking a block's progress has a side effect: trg_user_block_progress_after_insert
  -- advances the learner's user_course_resume pointer. Clear it too, or the
  -- legitimate rollback below would correctly refuse on this test's residue.
  delete from public.user_course_resume
  where user_id = '05500000-0000-5000-a000-0000000000f0';
end;
$$;

-- Lineage refusals, then the real rollback of revision 4 (receipt 5).
do $$
declare
  v_confirmation text;
  v_result jsonb;
  v_catalog_after_revision_3 text;
begin
  select catalog_sha256 into v_catalog_after_revision_3
  from public.content_import_release_revisions
  where import_id = 'test-content-block-revision-v2' and revision = 3 and kind = 'content_blocks';

  -- Revision 3 exists and its confirmation is correct, but the current
  -- state lineage is revision 4 -- rolling back 3 from here would skip a
  -- revision. Refused by lineage, before any catalog comparison.
  begin
    perform public.fn_rollback_released_content_block_revision_v1(
      'test-content-block-revision-v2', 3,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:3:'
        || repeat('2', 64) || ':' || repeat('9', 64) || ':' || repeat('e', 64)
    );
    raise exception 'rollback of a non-head lineage revision was accepted';
  exception when sqlstate '40001' then
    if sqlerrm not like '%not the active state lineage (current state is revision 4)%' then raise; end if;
  end;

  -- A quiz-kind revision is not a content-block rollback target.
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
    or (v_result ->> 'reverts_revision')::int <> 4
    or (v_result ->> 'restored_state_revision')::int <> 3
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
  if (
    select (reverts_revision, state_parent_revision)
    from public.content_import_release_revisions
    where import_id = 'test-content-block-revision-v2' and revision = 5
  ) <> (4, 3) then
    raise exception 'the rollback receipt did not record reverts=4 / restored-state=3';
  end if;
end;
$$;

-- Chained rollback: with revision 4 already rolled back (receipt 5), rolling
-- back revision 3 from the restored state must append its receipt at the END
-- of the shared sequence (6), not at 3 + 1 = 4 -- which already exists and
-- would PK-collide, atomically aborting the emergency rollback.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_rollback_released_content_block_revision_v1(
    'test-content-block-revision-v2', 3,
    jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('f', 64)),
    'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:3:'
      || repeat('2', 64) || ':' || repeat('9', 64) || ':' || repeat('f', 64)
  );
  if v_result ->> 'status' <> 'rolled_back'
    or (v_result ->> 'revision')::int <> 6
    or (v_result ->> 'reverts_revision')::int <> 3
    or (v_result ->> 'restored_state_revision')::int <> 2
  then
    raise exception 'chained rollback returned an unexpected receipt: %', v_result;
  end if;

  if (
    select content from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000007'
  ) <> '{"html":"<p>Original A</p>"}'::jsonb then
    raise exception 'chained rollback did not restore the original text block';
  end if;
  if exists (
    select 1 from public.content_blocks
    where id in (
      '05500000-0000-5000-a000-000000000009',
      '05500000-0000-5000-a000-00000000000a'
    )
  ) then
    raise exception 'chained rollback did not remove the blocks revision 3 inserted';
  end if;
  if (
    select active_manifest_sha256 from public.content_import_active_release_v1
    where import_id = 'test-content-block-revision-v2'
  ) <> repeat('9', 64) then
    raise exception 'chained rollback did not restore the quiz-kind fixture manifest as active (mixed-kind history broke)';
  end if;
  if public.fn_current_state_revision('test-content-block-revision-v2') <> 2 then
    raise exception 'canonical state did not resolve through the chained rollback receipts to the quiz revision';
  end if;
end;
$$;

-- Repeated catalog state: re-apply revision 3's exact payload as revision 7.
-- Live catalog now equals revision 3's recorded catalog again -- so a
-- checksum-only legality rule would accept rolling back the OLD receipt 3
-- and rewind to ITS parent. Lineage must refuse the old receipt and permit
-- only revision 7, whose rollback restores the true current parent.
do $$
declare
  v_prior_manifest text := repeat('9', 64);
  v_manifest text := repeat('2', 64);
  v_prior_catalog text;
  v_mutations jsonb;
  v_database_payload text;
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

  v_result := public.fn_revise_released_content_blocks_v2(
    'test-content-block-revision-v2', v_prior_manifest, v_manifest,
    v_prior_catalog, v_mutations, repeat('7', 64),
    jsonb_build_object(
      'operation', 'released_content_blocks_v2',
      'manifest_sha256', v_manifest,
      'expected_prior_catalog_sha256', v_prior_catalog
    ),
    'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
      || v_prior_manifest || ':' || v_manifest || ':' || v_prior_catalog || ':'
      || v_database_payload || ':3'
  );
  if v_result ->> 'status' <> 'revised' or (v_result ->> 'revision')::int <> 7 then
    raise exception 're-applying the payload returned an unexpected receipt: %', v_result;
  end if;
  if (
    select state_parent_revision from public.content_import_release_revisions
    where import_id = 'test-content-block-revision-v2' and revision = 7
  ) <> 6 then
    raise exception 'the re-applied revision did not record the rollback receipt as its state parent';
  end if;

  -- The stale receipt 3 now has a MATCHING live catalog (repeated state) and
  -- a correct confirmation -- and must still be refused, by lineage.
  begin
    perform public.fn_rollback_released_content_block_revision_v1(
      'test-content-block-revision-v2', 3,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:3:'
        || repeat('2', 64) || ':' || repeat('9', 64) || ':' || repeat('e', 64)
    );
    raise exception 'a stale forward receipt with a repeated catalog state was accepted for rollback';
  exception when sqlstate '40001' then
    if sqlerrm not like '%not the active state lineage (current state is revision 7)%' then raise; end if;
  end;

  -- Rolling back the true lineage head restores the true current parent.
  v_result := public.fn_rollback_released_content_block_revision_v1(
    'test-content-block-revision-v2', 7,
    jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
    'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:7:'
      || repeat('2', 64) || ':' || repeat('9', 64) || ':' || repeat('e', 64)
  );
  if v_result ->> 'status' <> 'rolled_back'
    or (v_result ->> 'revision')::int <> 8
    or (v_result ->> 'reverts_revision')::int <> 7
    or (v_result ->> 'restored_state_revision')::int <> 6
  then
    raise exception 'head rollback returned an unexpected receipt: %', v_result;
  end if;
  if (
    select content from public.content_blocks
    where id = '05500000-0000-5000-a000-000000000007'
  ) <> '{"html":"<p>Original A</p>"}'::jsonb then
    raise exception 'head rollback did not restore the original text block';
  end if;
  if public.fn_current_state_revision('test-content-block-revision-v2') <> 2 then
    raise exception 'canonical state did not resolve through chained receipts back to the quiz revision';
  end if;
end;
$$;

-- Continuation through the quiz boundary: with content receipts 3..8 above
-- it in the sequence, the quiz revision (2) is the canonical current state,
-- and the quiz rollback's lineage gate must PASS for it -- reaching the
-- quiz function's own BMH release pin (which this lightweight fixture
-- deliberately fails) instead of dead-ending on "must be the latest row".
do $$
begin
  begin
    perform public.fn_rollback_released_quiz_revision_v1(
      'test-content-block-revision-v2', 2,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'irrelevant-the-pin-check-fires-first'
    );
    raise exception 'the quiz rollback pin unexpectedly passed for the lightweight fixture';
  exception when sqlstate '22023' then
    if sqlerrm not like '%not the exact forward BMH release%' then raise; end if;
  end;

  -- And a content revision number is not a quiz rollback target.
  begin
    perform public.fn_rollback_released_quiz_revision_v1(
      'test-content-block-revision-v2', 3,
      jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('e', 64)),
      'irrelevant'
    );
    raise exception 'the quiz rollback accepted a content-block revision as its target';
  exception when sqlstate '40001' then
    if sqlerrm not like '%active revision changed after preflight%' then raise; end if;
  end;
end;
$$;

-- Applied-v1-to-v2 transition: a pre-cutover legacy receipt (seeded with the
-- sealed guard disabled, exactly modeling receipts that existed before the
-- seal) is absorbed into the shared sequence by the SAME
-- fn_backfill_v1_content_block_revisions() the migration ran -- after full
-- predecessor/catalog validation -- and the backfill is idempotent.
do $$
declare
  v_live_catalog text;
  v_result jsonb;
  v_mirror public.content_import_release_revisions%rowtype;
begin
  v_live_catalog := public.fn_course_import_catalog_sha256('test-content-block-revision-v2');

  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id,
    original_release_manifest_sha256,
    expected_active_manifest_sha256,
    manifest_sha256,
    prior_catalog_sha256,
    replacement_catalog_sha256,
    database_payload_sha256,
    client_payload_sha256,
    guide_update_count,
    flashcard_update_count,
    role_play_insert_count,
    mutations,
    evidence
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64),
    repeat('9', 64),
    repeat('a', 64),
    repeat('b', 64),
    v_live_catalog,
    repeat('9', 64),
    repeat('d', 64),
    19, 19, 6,
    (
      select jsonb_agg(jsonb_build_object('fixture', item))
      from generate_series(1, 44) item
    ),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 1 then
    raise exception 'v1 backfill did not absorb exactly the seeded receipt: %', v_result;
  end if;

  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-content-block-revision-v2' and revision = 9;
  if not found
    or v_mirror.kind <> 'content_blocks'
    or v_mirror.state_parent_revision <> 8
    or v_mirror.prior_manifest_sha256 <> repeat('9', 64)
    or v_mirror.manifest_sha256 <> repeat('a', 64)
    or v_mirror.payload_sha256 <> repeat('9', 64)
    or v_mirror.mutation_count <> 44
    or v_mirror.update_count <> 38
    or v_mirror.insert_count <> 6
    or v_mirror.evidence ->> 'backfilled_from' <> 'released_content_blocks_v1'
  then
    raise exception 'the backfilled mirror row is missing or misshapen';
  end if;
  if (
    select active_manifest_sha256 from public.content_import_active_release_v1
    where import_id = 'test-content-block-revision-v2'
  ) <> repeat('a', 64) then
    raise exception 'the shared active-state view does not surface the backfilled v1 state';
  end if;

  -- Idempotency: a second run must absorb nothing.
  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 0 then
    raise exception 'v1 backfill re-absorbed an already-mirrored receipt: %', v_result;
  end if;

  -- The retired v1 RPC must be dead regardless of arguments.
  begin
    perform public.fn_revise_released_content_blocks_v1(
      'test-content-block-revision-v2',
      repeat('1', 64), repeat('2', 64), repeat('3', 64),
      '[]'::jsonb, repeat('4', 64), '{}'::jsonb, 'invalid'
    );
    raise exception 'the retired v1 RPC was callable after backfill';
  exception when sqlstate '42501' then
    if sqlerrm not like '%retired%' then raise; end if;
  end;
end;
$$;

-- Backfill validation negatives -- each seeded receipt is invalid in one
-- precise way and must ABORT the backfill (fail loud, never append garbage).
do $$
declare
  v_live_catalog text;
begin
  v_live_catalog := public.fn_course_import_catalog_sha256('test-content-block-revision-v2');

  -- (a) Broken predecessor chain: declares a predecessor manifest that is
  -- not the shared ledger's active manifest.
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64), repeat('8', 64), repeat('b', 64),
    repeat('b', 64), v_live_catalog, repeat('e', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
  begin
    perform public.fn_backfill_v1_content_block_revisions();
    raise exception 'a legacy receipt with a broken predecessor chain was mirrored';
  exception when others then
    if sqlerrm not like '%declares predecessor manifest%' then raise; end if;
  end;
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  delete from public.content_import_released_content_block_revision_records
  where import_id = 'test-content-block-revision-v2' and manifest_sha256 = repeat('b', 64);
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  -- (b) Identity mismatch against an existing mirror: same payload digest as
  -- the already-mirrored receipt, different manifest.
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64), repeat('a', 64), repeat('c', 64),
    repeat('b', 64), v_live_catalog, repeat('9', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
  begin
    perform public.fn_backfill_v1_content_block_revisions();
    raise exception 'a legacy receipt with a mismatched mirror identity was accepted';
  exception when others then
    if sqlerrm not like '%does not match the legacy receipt identity%' then raise; end if;
  end;
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  delete from public.content_import_released_content_block_revision_records
  where import_id = 'test-content-block-revision-v2' and manifest_sha256 = repeat('c', 64);
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  -- (c) Final catalog mismatch: the chain links up but the database is not
  -- actually in the state the legacy history claims.
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64), repeat('a', 64), repeat('e', 64),
    repeat('b', 64), repeat('c', 64), repeat('b', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
  begin
    perform public.fn_backfill_v1_content_block_revisions();
    raise exception 'a legacy receipt whose final catalog contradicts reality was mirrored';
  exception when others then
    if sqlerrm not like '%live catalog for%' then raise; end if;
  end;
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  delete from public.content_import_released_content_block_revision_records
  where import_id = 'test-content-block-revision-v2' and manifest_sha256 = repeat('e', 64);
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
end;
$$;

-- Direct insert-guard trigger checks for the v2 branch: no marker is
-- refused; a well-formed v2 marker for a published release is accepted
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

-- The atomic admin merge for role-play blocks: merges exactly the three
-- form fields onto the LIVE row content in one statement, preserving every
-- other key (the oral-check marker most importantly), and touches nothing
-- but role_play rows.
do $$
declare
  v_merged jsonb;
begin
  -- The marked insert above left block f2 as a text block; the merge must
  -- not touch it.
  if public.fn_admin_merge_role_play_block_content(
    '05500000-0000-5000-a000-0000000000f2',
    'scenario-x', 'Title', 700, false
  ) is not null then
    raise exception 'the role-play merge touched a non-role_play block';
  end if;

  perform set_config('bmh.revise_content_blocks_v2_import_id', 'test-content-block-revision-v2', true);
  perform set_config(
    'bmh.revise_content_blocks_v2_payload_sha256',
    encode(sha256('merge-fixture'::bytea), 'hex'),
    true
  );
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  ) values (
    '05500000-0000-5000-a000-0000000000f4',
    '05500000-0000-5000-a000-000000000006',
    'role_play',
    '{"mode":"oral_check","scenario_id":"pending:merge","scenario_spec":{"context":"spec"},"title":"Before","height_px":760}'::jsonb,
    9, false
  );
  perform set_config('bmh.revise_content_blocks_v2_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_v2_payload_sha256', '', true);

  v_merged := public.fn_admin_merge_role_play_block_content(
    '05500000-0000-5000-a000-0000000000f4',
    'pending:merge', 'After', 800, true
  );
  if v_merged is distinct from
    '{"mode":"oral_check","scenario_id":"pending:merge","scenario_spec":{"context":"spec"},"title":"After","height_px":800}'::jsonb
  then
    raise exception 'the atomic merge did not preserve untouched content keys: %', v_merged;
  end if;
  if not exists (
    select 1 from public.content_blocks
    where id = '05500000-0000-5000-a000-0000000000f4'
      and is_required_for_completion
  ) then
    raise exception 'the atomic merge did not persist the required flag';
  end if;
end;
$$;

-- Ledger immutability on the shared table.
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
