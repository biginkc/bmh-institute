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

-- Test-scoped only (installed inside this rolled-back transaction, never
-- touching real schema): enables a genuine SEPARATE-connection two-session
-- lock race further down, rather than the in-transaction lock-assertion
-- substitute a prior round used (round-6 review: that substitute "only
-- proves the mechanism exists, not that it's complete").
create extension if not exists dblink;

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

-- Round-6 review findings 2 and 3 (genuine two-session races): a second
-- REAL backend session (via dblink -- a separate connection and
-- transaction, not an in-transaction lock-assertion substitute) holds a
-- plain writer's lock on catalog-hash tables while the main session calls
-- the backfill and the forward content-block RPC. If the canonical lock set
-- is complete, each call must BLOCK on those tables and time out under this
-- session's 10s lock_timeout.
--
-- Deliberately: (a) placed here, before any other fixture/RPC call in this
-- file takes its own SHARE ROW EXCLUSIVE locks on these same tables, and
-- (b) never followed by a "now it succeeds" call -- this whole file is ONE
-- transaction (begin; ... rollback;), so any call that actually COMPLETES
-- would keep holding the full canonical lock set (via
-- fn_lock_course_import_catalog_tables) for the rest of the file, which
-- would make THIS session -- not the dblink writer -- the one blocking a
-- later race check. Every call below is expected to error via
-- lock_not_available, which unwinds before it holds anything, so multiple
-- independent race checks can safely share this one transaction.
do $$
declare
  v_blocked boolean;
  v_mutations jsonb;
  v_database_payload_sha256 text;
  v_confirmation text;
begin
  -- Built from this backend's OWN live settings (not a hardcoded host/port)
  -- so the same test works against any cluster's actual socket directory
  -- and port, local or CI, rather than assuming the default 5432.
  perform dblink_connect('bmh_lock_race',
    'host=' || split_part(current_setting('unix_socket_directories'), ',', 1)
    || ' port=' || current_setting('port')
    || ' dbname=' || current_database()
    || ' user=' || current_user
  );

  -- (1) course_access AND program_courses vs. the backfill (findings 2 and
  -- 3 -- neither was in the backfill's lock set before this round).
  perform dblink_exec('bmh_lock_race', 'begin');
  perform dblink_exec('bmh_lock_race', 'delete from public.course_access where false');
  perform dblink_exec('bmh_lock_race', 'delete from public.program_courses where false');
  v_blocked := false;
  begin
    perform public.fn_backfill_v1_content_block_revisions();
  exception when lock_not_available then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'the backfill did not block on a concurrent course_access/program_courses writer -- findings 2/3 regressed';
  end if;
  perform dblink_exec('bmh_lock_race', 'rollback');

  -- (2) quizzes vs. the forward content-block RPC (finding 3 -- quizzes was
  -- never locked by this RPC before the round-6 fix). Uses a fresh
  -- non-existent import_id: the shape/evidence checks that run before the
  -- lock never look it up, so this is valid regardless.
  perform dblink_exec('bmh_lock_race', 'begin');
  perform dblink_exec('bmh_lock_race', 'delete from public.quizzes where false');
  v_blocked := false;
  v_mutations := jsonb_build_array(jsonb_build_object(
    'action', 'insert', 'source_key', 'block-lock-race-check',
    'block_id', '00000000-0000-5000-a000-0000000000f0',
    'lesson_id', '00000000-0000-5000-a000-000000000098',
    'block_type', 'role_play', 'expected_content', null,
    'replacement_content', '{"scenario_id":"pending:lock-race-check"}'::jsonb,
    'sort_order', 0, 'is_required_for_completion', false,
    'replacement_sha256', null, 'replacement_size_bytes', null
  ));
  -- Confirmation is checked BEFORE the lock, so it must be the real one
  -- PostgreSQL would compute (same formula the RPC uses internally) --
  -- otherwise this call errors on the confirmation mismatch instead of ever
  -- reaching the lock this test means to exercise.
  v_database_payload_sha256 := encode(sha256(convert_to(v_mutations::text, 'UTF8')), 'hex');
  v_confirmation := 'REVISE-RELEASED-CONTENT-BLOCKS-V2:' || 'test-lock-race-v2' || ':'
    || repeat('1', 64) || ':' || repeat('2', 64) || ':'
    || repeat('3', 64) || ':' || v_database_payload_sha256 || ':' || '1';
  begin
    perform public.fn_revise_released_content_blocks_v2(
      'test-lock-race-v2', repeat('1', 64), repeat('2', 64),
      repeat('3', 64),
      v_mutations,
      repeat('4', 64),
      jsonb_build_object(
        'operation', 'released_content_blocks_v2',
        'manifest_sha256', repeat('2', 64),
        'expected_prior_catalog_sha256', repeat('3', 64)
      ),
      v_confirmation
    );
  exception when lock_not_available then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'the forward content-block RPC did not block on a concurrent quizzes writer -- finding 3 regressed';
  end if;
  perform dblink_exec('bmh_lock_race', 'rollback');

  perform dblink_disconnect('bmh_lock_race');
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

  -- `already_revised` must bind to the ACTIVE IMMUTABLE RECEIPT, never be
  -- inferred from matching live rows alone. A SUBSET of the committed
  -- payload -- every one of whose rows still matches live state -- is a
  -- DIFFERENT operation and must be refused.
  declare
    v_subset jsonb := jsonb_build_array(v_mutations -> 0);
    v_subset_payload text;
  begin
    v_subset_payload := encode(sha256(convert_to(v_subset::text, 'UTF8')), 'hex');
    begin
      perform public.fn_revise_released_content_blocks_v2(
        'test-content-block-revision-v2', v_prior_manifest, v_manifest,
        v_prior_catalog, v_subset, v_client_payload,
        jsonb_build_object(
          'operation', 'released_content_blocks_v2',
          'manifest_sha256', v_manifest,
          'expected_prior_catalog_sha256', v_prior_catalog
        ),
        'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
          || v_prior_manifest || ':' || v_manifest || ':' || v_prior_catalog || ':'
          || v_subset_payload || ':1'
      );
      raise exception 'a subset replay was granted already_revised';
    exception when sqlstate '40001' then
      if sqlerrm not like '%does not bind to the active immutable receipt%' then raise; end if;
    end;
  end;

  -- An ALTERED payload targeting the same active manifest must be refused,
  -- not reported as already applied.
  declare
    v_altered jsonb;
    v_altered_payload text;
  begin
    v_altered := jsonb_set(
      v_mutations, '{0,replacement_content}', '{"html":"<p>Altered</p>"}'::jsonb
    );
    v_altered_payload := encode(sha256(convert_to(v_altered::text, 'UTF8')), 'hex');
    begin
      perform public.fn_revise_released_content_blocks_v2(
        'test-content-block-revision-v2', v_prior_manifest, v_manifest,
        v_prior_catalog, v_altered, v_client_payload,
        jsonb_build_object(
          'operation', 'released_content_blocks_v2',
          'manifest_sha256', v_manifest,
          'expected_prior_catalog_sha256', v_prior_catalog
        ),
        'REVISE-RELEASED-CONTENT-BLOCKS-V2:test-content-block-revision-v2:'
          || v_prior_manifest || ':' || v_manifest || ':' || v_prior_catalog || ':'
          || v_altered_payload || ':3'
      );
      raise exception 'an altered-payload replay was granted already_revised';
    exception when sqlstate '40001' then
      if sqlerrm not like '%does not bind to the active immutable receipt%' then raise; end if;
    end;
  end;

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

-- Applied-v1-to-v2 transition: TWO chained pre-cutover legacy receipts
-- (seeded with the sealed guard disabled, exactly modeling receipts that
-- existed before the seal) are absorbed in order by the SAME
-- fn_backfill_v1_content_block_revisions() the migration ran -- proving
-- receipt-to-receipt manifest AND catalog linkage -- and the backfill is
-- idempotent. Receipt one's replacement catalog is an intermediate value;
-- receipt two must chain from it exactly and land on the live catalog.
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
    evidence,
    revised_at
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64),
    repeat('9', 64),
    repeat('a', 64),
    -- Round-6 review fix (finding 1): this MUST be the real live catalog at
    -- this point, not an arbitrary placeholder -- the backfill now checks
    -- every receipt's prior catalog unconditionally, including the first.
    v_live_catalog,
    repeat('5', 64),
    repeat('9', 64),
    repeat('d', 64),
    19, 19, 6,
    (
      select jsonb_agg(jsonb_build_object('fixture', item))
      from generate_series(1, 44) item
    ),
    '{}'::jsonb,
    now() - interval '2 minutes'
  ), (
    'test-content-block-revision-v2',
    repeat('1', 64),
    repeat('a', 64),
    repeat('0', 64),
    repeat('5', 64),
    v_live_catalog,
    repeat('c', 64),
    repeat('d', 64),
    19, 19, 6,
    (
      select jsonb_agg(jsonb_build_object('fixture', item))
      from generate_series(1, 44) item
    ),
    '{}'::jsonb,
    now() - interval '1 minute'
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 2 then
    raise exception 'v1 backfill did not absorb exactly the two chained receipts: %', v_result;
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
    raise exception 'the first backfilled mirror row is missing or misshapen';
  end if;
  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-content-block-revision-v2' and revision = 10;
  if not found
    or v_mirror.kind <> 'content_blocks'
    or v_mirror.state_parent_revision <> 9
    or v_mirror.prior_manifest_sha256 <> repeat('a', 64)
    or v_mirror.manifest_sha256 <> repeat('0', 64)
    or v_mirror.prior_catalog_sha256 <> repeat('5', 64)
    or v_mirror.catalog_sha256 <> v_live_catalog
  then
    raise exception 'the second backfilled mirror row did not chain catalog-to-catalog';
  end if;
  if (
    select active_manifest_sha256 from public.content_import_active_release_v1
    where import_id = 'test-content-block-revision-v2'
  ) <> repeat('0', 64) then
    raise exception 'the shared active-state view does not surface the backfilled v1 state';
  end if;

  -- The backfill's own transaction must be holding table locks on every
  -- catalog table it hashed, so a concurrent write cannot land between the
  -- final hash and commit. (A live two-session pause test is not possible
  -- in this single-connection harness; asserting the held locks is the
  -- verifiable core of the property.)
  if (
    select count(*)
    from pg_locks lock
    join pg_class relation on relation.oid = lock.relation
    where lock.pid = pg_backend_pid()
      and lock.mode = 'ShareRowExclusiveLock'
      and lock.granted
      and relation.relname in (
        'content_blocks', 'quizzes', 'questions', 'answer_options',
        'assignments', 'program_courses', 'program_access', 'role_groups'
      )
  ) < 8 then
    raise exception 'the backfill did not hold catalog-table locks through its final verification';
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
    v_live_catalog, repeat('e', 64), repeat('e', 64), repeat('d', 64),
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

  -- (a2) Broken predecessor CATALOG: the manifest chains correctly from the
  -- active mirror, but the declared prior catalog does not equal the
  -- predecessor mirror's replacement catalog.
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
    repeat('1', 64), repeat('0', 64), repeat('b', 64),
    repeat('4', 64), repeat('e', 64), repeat('e', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
  begin
    perform public.fn_backfill_v1_content_block_revisions();
    raise exception 'a legacy receipt with a broken predecessor catalog was mirrored';
  exception when others then
    if sqlerrm not like '%declares predecessor catalog%' then raise; end if;
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

  -- (c) Final catalog mismatch: the chain links up (manifest AND catalog)
  -- but the database is not actually in the state the legacy history claims.
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
    repeat('1', 64), repeat('0', 64), repeat('e', 64),
    v_live_catalog, repeat('c', 64), repeat('b', 64), repeat('d', 64),
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

-- Round-6 review finding 1: a legacy receipt with NO predecessor mirror at
-- all (the true first event ever backfilled for a fresh import) must be
-- validated too, not given a free pass. Prior code special-cased "no mirror
-- exists yet" to skip the catalog check entirely; the fix processes every
-- legacy source (v1 content-block receipts, poster/caption replacements) in
-- one true chronological order, so even the very first receipt is checked
-- against the real active catalog. Use a FRESH import with no history at
-- all so this is genuinely the first event, not merely the first of one
-- source with others already chained.
do $$
declare
  v_program_id uuid := '00000000-0000-6000-a000-000000000f01';
  v_course_id uuid := '00000000-0000-6000-a000-000000000f02';
  v_release_catalog text;
begin
  perform set_config('bmh.apply_import_id', 'test-first-receipt-v2', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Round 6 First Receipt Fixture', 'test-first-receipt-v2', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Round 6 First Receipt Course', 'test-first-receipt-v2', false, false);
  insert into public.program_courses (program_id, course_id, sort_order)
  values (v_program_id, v_course_id, 0);
  perform set_config('bmh.apply_import_id', '', true);

  v_release_catalog := public.fn_course_import_catalog_sha256('test-first-receipt-v2');
  perform set_config('bmh.release_import_id', 'test-first-receipt-v2', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'test-first-receipt-v2', v_program_id,
    '00000000-0000-6000-a000-000000000f03', '00000000-0000-6000-a000-000000000f04',
    repeat('1', 64), repeat('2', 64), v_release_catalog,
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'test-first-receipt-v2';
  update public.courses set is_published = true where content_import_id = 'test-first-receipt-v2';
  perform set_config('bmh.release_import_id', '', true);

  -- Crafted first receipt: declares an ARBITRARY prior catalog instead of
  -- the real release catalog. Must now be refused -- there is no more
  -- "first receipt" exemption.
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence
  ) values (
    'test-first-receipt-v2',
    repeat('1', 64), repeat('1', 64), repeat('2', 64),
    repeat('f', 64), repeat('e', 64), repeat('9', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
  begin
    perform public.fn_backfill_v1_content_block_revisions();
    raise exception 'a crafted FIRST receipt with an arbitrary prior catalog was mirrored -- finding 1 regressed';
  exception when others then
    if sqlerrm not like '%declares predecessor catalog%' then raise; end if;
  end;
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  delete from public.content_import_released_content_block_revision_records
  where import_id = 'test-first-receipt-v2';
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;
end;
$$;

-- Round-6 review finding 1 (positive path): a released-poster replacement
-- that ran between the original release and the first v1 content-block
-- receipt is absorbed as a validated `legacy_catalog_correction` lineage
-- row, and the content-block receipt's prior catalog -- which legitimately
-- differs from the ORIGINAL release catalog because of that poster fix --
-- chains correctly against it instead of being left unvalidated.
do $$
declare
  v_program_id uuid := '00000000-0000-6000-a000-000000000f11';
  v_course_id uuid := '00000000-0000-6000-a000-000000000f12';
  v_release_catalog text;
  v_after_poster_catalog text;
  v_result jsonb;
  v_mirror public.content_import_release_revisions%rowtype;
begin
  perform set_config('bmh.apply_import_id', 'test-poster-chain-v2', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Round 6 Poster Chain Fixture', 'test-poster-chain-v2', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Round 6 Poster Chain Course', 'test-poster-chain-v2', false, false);
  insert into public.program_courses (program_id, course_id, sort_order)
  values (v_program_id, v_course_id, 0);
  perform set_config('bmh.apply_import_id', '', true);

  v_release_catalog := public.fn_course_import_catalog_sha256('test-poster-chain-v2');
  perform set_config('bmh.release_import_id', 'test-poster-chain-v2', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'test-poster-chain-v2', v_program_id,
    '00000000-0000-6000-a000-000000000f13', '00000000-0000-6000-a000-000000000f14',
    repeat('1', 64), repeat('2', 64), v_release_catalog,
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'test-poster-chain-v2';
  update public.courses set is_published = true where content_import_id = 'test-poster-chain-v2';
  perform set_config('bmh.release_import_id', '', true);

  -- Publishing flips is_published, which is itself part of the catalog hash
  -- -- the release record's OWN catalog_sha256 legitimately reflects the
  -- PRE-publish state (matching fn_release_course_import_v1's real
  -- ordering), but the TRUE final live state (what the backfill's reality
  -- check will actually recompute) is the POST-publish catalog. Nothing
  -- else in this fixture mutates catalog-relevant rows, so this is the real
  -- final state the content-block receipt's replacement must land on.
  v_after_poster_catalog := public.fn_course_import_catalog_sha256('test-poster-chain-v2');

  -- A poster replacement happened after release but before any content-block
  -- receipt. Its replacement_catalog_sha256 is synthetic here (the real
  -- mechanism would have actually mutated content_blocks poster paths and
  -- rehashed) -- what matters for this test is that the BACKFILL absorbs it
  -- as a lineage edge and the NEXT receipt chains against ITS catalog, not
  -- the original release's.
  alter table public.content_import_video_poster_replacement_records
    disable trigger content_import_video_poster_replacement_records_guard;
  insert into public.content_import_video_poster_replacement_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    approval_evidence_sha256, preflight_evidence_sha256,
    replacement_count, replacements, replaced_at
  ) values (
    'test-poster-chain-v2', v_release_catalog, repeat('7', 64),
    repeat('6', 64), repeat('5', 64),
    repeat('4', 64), repeat('3', 64),
    1, '[{"block_id":"x"}]'::jsonb, now() - interval '3 minutes'
  );
  alter table public.content_import_video_poster_replacement_records
    enable trigger content_import_video_poster_replacement_records_guard;

  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence, revised_at
  ) values (
    'test-poster-chain-v2',
    repeat('1', 64), repeat('1', 64), repeat('2', 64),
    -- Prior catalog is the POSTER fix's replacement, not the original
    -- release catalog -- the historically real shape this whole mechanism
    -- exists to accommodate. Replacement catalog must be the REAL final
    -- live catalog -- the final reality check recomputes it fresh, not a
    -- placeholder.
    repeat('7', 64), v_after_poster_catalog, repeat('9', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb,
    now() - interval '2 minutes'
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 2 then
    raise exception 'v1 backfill did not absorb the poster correction plus the content-block receipt: %', v_result;
  end if;

  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-poster-chain-v2' and revision = 2;
  if not found
    or v_mirror.kind <> 'legacy_catalog_correction'
    or v_mirror.prior_catalog_sha256 <> v_release_catalog
    or v_mirror.catalog_sha256 <> repeat('7', 64)
    or v_mirror.manifest_sha256 <> repeat('1', 64)
    or v_mirror.mutation_count is not null
    or v_mirror.evidence ->> 'backfilled_from' <> 'released_video_poster_replacement_v1'
  then
    raise exception 'the poster replacement was not backfilled as a validated legacy_catalog_correction lineage row: %', to_jsonb(v_mirror);
  end if;

  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-poster-chain-v2' and revision = 3;
  if not found
    or v_mirror.kind <> 'content_blocks'
    or v_mirror.state_parent_revision <> 2
    or v_mirror.prior_catalog_sha256 <> repeat('7', 64)
  then
    raise exception 'the content-block receipt did not chain against the poster correction''s resulting catalog: %', to_jsonb(v_mirror);
  end if;
  if public.fn_current_state_revision('test-poster-chain-v2') <> 3 then
    raise exception 'the poster-chained lineage did not resolve to the final content-block revision';
  end if;
end;
$$;

-- Round-6 review findings 2 and 3: the canonical catalog-hash lock set must
-- be the EXACT set of tables fn_course_import_catalog_sha256 reads, not a
-- remembered list -- mechanically parsed from the function's own source
-- rather than hand-asserted, per the review's explicit ask.
do $$
declare
  v_source text;
  v_referenced text[];
  v_canonical text[];
  v_missing text[];
  v_extra text[];
begin
  select pg_get_functiondef(proc.oid) into v_source
  from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'fn_course_import_catalog_sha256';
  if v_source is null then
    raise exception 'fn_course_import_catalog_sha256 not found for lock-set verification';
  end if;

  select coalesce(array_agg(distinct lower(m[1]) order by lower(m[1])), '{}')
  into v_referenced
  from regexp_matches(v_source, '(?:from|join)\s+public\.([a-z_]+)', 'gi') m;

  select public.fn_course_import_catalog_lock_tables() into v_canonical;

  select coalesce(array_agg(item), '{}') into v_missing
  from unnest(v_referenced) item where not (item = any(v_canonical));
  select coalesce(array_agg(item), '{}') into v_extra
  from unnest(v_canonical) item where not (item = any(v_referenced));

  if array_length(v_missing, 1) > 0 or array_length(v_extra, 1) > 0 then
    raise exception 'fn_course_import_catalog_lock_tables() (%) does not exactly match the tables fn_course_import_catalog_sha256 references (%) -- missing %, extra %',
      v_canonical, v_referenced, v_missing, v_extra;
  end if;
end;
$$;

-- Pre-migration lineage classification: legacy quiz ledger rows (forward
-- revisions AND rollback receipts) predate the lineage columns entirely.
-- fn_classify_legacy_ledger_lineage -- the same function the migration ran
-- over existing history -- must classify them exactly (forward: parent =
-- revision - 1; legacy rollback receipt N: reverted N - 1, restored N - 2
-- floored at 1), the guard trigger must classify a resumed OLD-BODY rollback
-- insert by its evidence operation, canonical state must resolve through
-- the classified receipts, and ambiguous history must abort.
do $$
declare
  v_result jsonb;
begin
  perform set_config('bmh.release_import_id', 'test-legacy-lineage-v2', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'test-legacy-lineage-v2',
    '05500000-0000-5000-a000-000000000021',
    '05500000-0000-5000-a000-000000000022',
    '05500000-0000-5000-a000-000000000023',
    repeat('1', 64), repeat('2', 64), repeat('3', 64),
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  perform set_config('bmh.release_import_id', '', true);

  -- Legacy-shaped rows: written BEFORE the lineage columns existed, so
  -- seeded with the guard disabled (exactly how they exist in reality).
  alter table public.content_import_release_revisions
    disable trigger content_import_release_revisions_guard;
  insert into public.content_import_release_revisions (
    import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence
  ) values (
    'test-legacy-lineage-v2', 2, 'quiz',
    repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"release"}'::jsonb
  ), (
    'test-legacy-lineage-v2', 3, 'quiz',
    repeat('2', 64), repeat('1', 64),
    repeat('4', 64), repeat('3', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"rollback"}'::jsonb
  );
  alter table public.content_import_release_revisions
    enable trigger content_import_release_revisions_guard;

  v_result := public.fn_classify_legacy_ledger_lineage();
  if (v_result ->> 'forward_rows')::int < 1 or (v_result ->> 'rollback_rows')::int < 1 then
    raise exception 'legacy lineage classification did not touch the seeded rows: %', v_result;
  end if;
  if (
    select (state_parent_revision, reverts_revision)
    from public.content_import_release_revisions
    where import_id = 'test-legacy-lineage-v2' and revision = 2
  ) is distinct from (1, null::integer) then
    raise exception 'the legacy forward row was not classified as parent 1';
  end if;
  if (
    select (state_parent_revision, reverts_revision)
    from public.content_import_release_revisions
    where import_id = 'test-legacy-lineage-v2' and revision = 3
  ) is distinct from (1, 2) then
    raise exception 'the legacy rollback receipt was not classified as reverts 2 / restored 1';
  end if;
  if public.fn_current_state_revision('test-legacy-lineage-v2') <> 1 then
    raise exception 'canonical state did not resolve through the classified legacy rollback receipt';
  end if;

  -- A resumed OLD-BODY insert (markers set by the resumed call itself, no
  -- lineage columns): the guard trigger classifies it by evidence operation.
  perform set_config('bmh.release_revision_import_id', 'test-legacy-lineage-v2', true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence
  ) values (
    'test-legacy-lineage-v2', 4, 'quiz',
    repeat('1', 64), repeat('6', 64),
    repeat('3', 64), repeat('6', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"release"}'::jsonb
  );
  insert into public.content_import_release_revisions (
    import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence
  ) values (
    'test-legacy-lineage-v2', 5, 'quiz',
    repeat('6', 64), repeat('1', 64),
    repeat('6', 64), repeat('3', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"rollback"}'::jsonb
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  if (
    select (state_parent_revision, reverts_revision)
    from public.content_import_release_revisions
    where import_id = 'test-legacy-lineage-v2' and revision = 4
  ) is distinct from (3, null::integer) then
    raise exception 'the guard did not fill the old-body forward insert''s state parent';
  end if;
  if (
    select (state_parent_revision, reverts_revision)
    from public.content_import_release_revisions
    where import_id = 'test-legacy-lineage-v2' and revision = 5
  ) is distinct from (3, 4) then
    raise exception 'the guard misclassified the old-body rollback insert';
  end if;
  if public.fn_current_state_revision('test-legacy-lineage-v2') <> 1 then
    raise exception 'canonical state did not resolve through the trigger-classified receipt chain';
  end if;

  -- Ambiguous history aborts: a legacy rollback receipt stacked directly on
  -- another legacy rollback receipt is impossible under the old model.
  alter table public.content_import_release_revisions
    disable trigger content_import_release_revisions_guard;
  insert into public.content_import_release_revisions (
    import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence
  ) values (
    'test-legacy-lineage-v2', 6, 'quiz',
    repeat('1', 64), repeat('7', 64),
    repeat('3', 64), repeat('7', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"rollback"}'::jsonb
  ), (
    'test-legacy-lineage-v2', 7, 'quiz',
    repeat('7', 64), repeat('1', 64),
    repeat('7', 64), repeat('3', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"rollback"}'::jsonb
  );
  alter table public.content_import_release_revisions
    enable trigger content_import_release_revisions_guard;
  begin
    perform public.fn_classify_legacy_ledger_lineage();
    raise exception 'ambiguous stacked legacy rollbacks were classified instead of aborting';
  exception when others then
    if sqlerrm not like '%sits directly on another rollback receipt%' then raise; end if;
  end;
  alter table public.content_import_release_revisions
    disable trigger content_import_release_revisions_guard;
  delete from public.content_import_release_revisions
  where import_id = 'test-legacy-lineage-v2' and revision in (6, 7);
  alter table public.content_import_release_revisions
    enable trigger content_import_release_revisions_guard;
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

-- The atomic admin merge for role-play blocks: a compare-and-swap that
-- merges exactly the three form fields onto the LIVE row content in one
-- statement, preserving every other key (the oral-check marker most
-- importantly), touches nothing but role_play rows, and refuses -- by
-- matching zero rows -- when the live scenario binding has moved past the
-- one the caller's browser loaded.
do $$
declare
  v_merged jsonb;
begin
  -- The marked insert above left block f2 as a text block; the merge must
  -- not touch it.
  if public.fn_admin_merge_role_play_block_content(
    '05500000-0000-5000-a000-0000000000f2',
    'scenario-x', 'scenario-x', 'Title', 700, false
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

  -- Compare-and-swap refusal: the caller loaded a STALE scenario binding
  -- (as if a publication rebound the block after their page load). Nothing
  -- may be written -- not even the title -- or the stale binding would be
  -- written back over the live one.
  if public.fn_admin_merge_role_play_block_content(
    '05500000-0000-5000-a000-0000000000f4',
    'pending:stale-binding', 'pending:stale-binding', 'Hijacked title', 700, true
  ) is not null then
    raise exception 'the merge accepted a stale scenario binding';
  end if;
  if (
    select content ->> 'title' from public.content_blocks
    where id = '05500000-0000-5000-a000-0000000000f4'
  ) <> 'Before' then
    raise exception 'the refused stale merge still modified the row';
  end if;

  v_merged := public.fn_admin_merge_role_play_block_content(
    '05500000-0000-5000-a000-0000000000f4',
    'pending:merge', 'pending:merge', 'After', 800, true
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
