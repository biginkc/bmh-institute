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

do $$
begin
  perform set_config('bmh.release_import_id', 'test-content-block-revision-v2', true);
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
  -- No post-publication attestation needed (round-8 simplification): this
  -- import's first legacy-touching event (the quiz fixture row below, or
  -- the later chained legacy receipts) is simply trusted directly by the
  -- backfill as the causal seed -- see 20260727180500's header comment.
  perform set_config('bmh.release_import_id', '', true);
end;
$$;

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

  -- Lineage classification against the REAL ledger (never a mocked
  -- classifier): with revision 4 the head, its ancestors -- 3, then the
  -- quiz fixture 2 -- classify as superseded, the head as active_head, and
  -- an absent revision as unknown.
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 4) <> 'active_head' then
    raise exception 'revision 4 did not classify as active_head while it is the head';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 3) <> 'superseded' then
    raise exception 'revision 3 did not classify as superseded under revision 4';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 2) <> 'superseded' then
    raise exception 'the quiz fixture revision did not classify as superseded under revision 4';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 999) <> 'unknown' then
    raise exception 'an absent revision did not classify as unknown';
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

  -- Lineage classification after CHAINED rollbacks, against the REAL ledger
  -- (the exact shape a single head-walk mislabeled: with rev5 reverting 4,
  -- rev6 reverting 3, and rev8 reverting the re-apply 7, a walk from the
  -- head jumps straight past the receipts that name 3 and 4). The complete
  -- reverts history classifies every undone forward revision as reverted,
  -- the restored quiz state as active_head, and rollback receipts
  -- themselves as neither states nor ancestors.
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 2) <> 'active_head' then
    raise exception 'the restored quiz state did not classify as active_head after chained rollbacks';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 3) <> 'reverted' then
    raise exception 'revision 3 did not classify as reverted (rev6 names it) after chained rollbacks';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 4) <> 'reverted' then
    raise exception 'revision 4 did not classify as reverted (rev5 names it) after chained rollbacks';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 7) <> 'reverted' then
    raise exception 'the re-apply revision 7 did not classify as reverted (rev8 names it)';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 8) <> 'diverged' then
    raise exception 'a rollback receipt classified as a state instead of a transition';
  end if;
  if public.fn_classify_revision_lineage('test-content-block-revision-v2', 999) <> 'unknown' then
    raise exception 'an absent revision did not classify as unknown after rollbacks';
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
-- existed before the seal) are absorbed by the SAME
-- fn_backfill_v1_content_block_revisions() the migration ran, through its
-- CAUSAL REPLAY: the walk first verifies the existing ledger rows (the quiz
-- fixture and the real v2 forward/rollback revisions 3..8) chain from the
-- release record -- attesting ONE publication-baseline lineage row for the
-- release's own pre-publication catalog capture -- then mirrors the two
-- receipts in receipt-to-receipt manifest AND catalog linkage, landing on
-- the live catalog. Idempotent on re-run. The receipts' timestamps sit
-- AFTER the ledger rows' (they model corrections made after the revisions),
-- which the walk's time-ordered queue requires -- all ledger rows share
-- this transaction's frozen now(), so the receipts use now()+N minutes.
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
    now() + interval '1 minute'
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
    now() + interval '2 minutes'
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 2 or (v_result ->> 'first_events_trusted')::int <> 1 then
    raise exception 'v1 backfill did not absorb exactly the two chained receipts (trusting the quiz fixture row as the first-ever event for this import): %', v_result;
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

  -- Idempotency: a second run must absorb nothing and attest nothing new --
  -- it re-verifies the whole causal chain (baseline included) instead.
  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 0 or (v_result ->> 'first_events_trusted')::int <> 0 then
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
  -- reconstructed causal state (this receipt sits after the mirrors in
  -- time, hence the future revised_at), but the declared prior catalog
  -- does not equal the predecessor's replacement catalog.
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence, revised_at
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64), repeat('0', 64), repeat('b', 64),
    repeat('4', 64), repeat('e', 64), repeat('e', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb, now() + interval '3 minutes'
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

  -- (c) Final catalog mismatch: the chain links up (manifest AND catalog --
  -- again positioned after the mirrors in time) but the database is not
  -- actually in the state the legacy history claims.
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence, revised_at
  ) values (
    'test-content-block-revision-v2',
    repeat('1', 64), repeat('0', 64), repeat('e', 64),
    v_live_catalog, repeat('c', 64), repeat('b', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb, now() + interval '3 minutes'
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

-- A crafted first receipt on a FRESH import (no history at all): its
-- arbitrary declared prior catalog is absorbed only as the attested
-- publication baseline (which is what the trust model allows -- receipts
-- come from sealed, CAS-guarded tables, so their priors are RPC evidence),
-- but the fabricated chain then fails the mandatory landing check: its
-- claimed final state does not equal the real live catalog, and the whole
-- backfill aborts with nothing appended. This is the fail-loud guarantee
-- for fabricated history -- a chain that does not end at reality cannot be
-- mirrored, first receipt or not.
do $$
declare
  v_program_id uuid := '00000000-0000-6000-a000-000000000f01';
  v_course_id uuid := '00000000-0000-6000-a000-000000000f02';
  v_release_catalog text;
  v_post_publish_catalog text;
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

  -- Round-8 simplification: there is no independent post-publication
  -- attestation column anymore (see the backfill migration's header
  -- comment) -- a first receipt's declared prior catalog is trusted
  -- directly, not rejected outright. But "trusted" is not "unchecked": a
  -- crafted first receipt with an ARBITRARY prior catalog AND an arbitrary
  -- replacement still cannot corrupt the ledger, because the reconstructed
  -- chain this fabricated value seeds must still terminate at the real LIVE
  -- catalog -- and it certainly will not, since nothing in the database
  -- actually produced these placeholder hashes. This is the FINAL safety
  -- net asserted by the header comment; verify it still catches this.
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
    raise exception 'a crafted FIRST receipt whose declared catalogs are arbitrary placeholders was mirrored without ever being checked against the live catalog';
  exception when others then
    if sqlerrm not like '%after replay, the live catalog for%' then raise; end if;
  end;
  if exists (
    select 1 from public.content_import_release_revisions
    where import_id = 'test-first-receipt-v2'
  ) then
    raise exception 'the aborted backfill left partial rows behind for the crafted receipt';
  end if;
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  delete from public.content_import_released_content_block_revision_records
  where import_id = 'test-first-receipt-v2';
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  -- The classifier's fourth state, on this now-receipt-free import: two
  -- SIBLING forward revisions both claiming state parent 1 (corrupted
  -- lineage -- a real chain can never fork). The head resolves to the
  -- later sibling; the earlier one is neither its ancestor nor named by
  -- any rollback receipt, so it must classify as diverged, never as a
  -- silent success state.
  perform set_config('bmh.release_revision_import_id', 'test-first-receipt-v2', true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence
  ) values (
    'test-first-receipt-v2', 2, 'quiz', 1,
    repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64), repeat('5', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"release"}'::jsonb
  ), (
    'test-first-receipt-v2', 3, 'quiz', 1,
    repeat('1', 64), repeat('6', 64),
    repeat('3', 64), repeat('7', 64), repeat('8', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"release"}'::jsonb
  );
  perform set_config('bmh.release_revision_import_id', '', true);
  if public.fn_classify_revision_lineage('test-first-receipt-v2', 3) <> 'active_head' then
    raise exception 'the later sibling did not classify as active_head';
  end if;
  if public.fn_classify_revision_lineage('test-first-receipt-v2', 2) <> 'diverged' then
    raise exception 'a forked sibling revision did not classify as diverged';
  end if;
end;
$$;

-- Round-8 replacement for the old round-7 "finding 3, other half" test: that
-- version asserted a release with no independent post-publication
-- attestation must be REJECTED outright -- exactly the requirement whose
-- production-breaking consequences (finding 1, CRITICAL) this round's
-- redesign removed. The historical-release-with-no-release-anchor-row case
-- (real production data, entirely) is now the PRIMARY case this backfill
-- must handle, not an error path: a single genuine receipt with a REAL,
-- correctly-chained catalog is trusted directly as this import's
-- first-ever event and absorbed cleanly, no attestation required.
do $$
declare
  v_program_id uuid := '00000000-0000-6000-a000-000000000f31';
  v_course_id uuid := '00000000-0000-6000-a000-000000000f32';
  v_module_id uuid := '00000000-0000-6000-a000-000000000f35';
  v_lesson_id uuid := '00000000-0000-6000-a000-000000000f36';
  v_text_block_id uuid := '00000000-0000-6000-a000-000000000f37';
  v_release_catalog text;
  v_post_publish_catalog text;
  v_after_content_catalog text;
  v_result jsonb;
  v_mirror public.content_import_release_revisions%rowtype;
begin
  perform set_config('bmh.apply_import_id', 'test-unattested-release-v2', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Round 8 Unattested Release Fixture', 'test-unattested-release-v2', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Round 8 Unattested Release Course', 'test-unattested-release-v2', false, false);
  insert into public.program_courses (program_id, course_id, sort_order)
  values (v_program_id, v_course_id, 0);
  insert into public.modules (id, course_id, title, sort_order)
  values (v_module_id, v_course_id, 'Round 8 Unattested Release Module', 1);
  insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id)
  values (v_lesson_id, v_module_id, 'Round 8 Unattested Release Lesson', 'content', 1, 'test-unattested-release-v2');
  insert into public.content_blocks (id, lesson_id, block_type, content, sort_order, is_required_for_completion)
  values (v_text_block_id, v_lesson_id, 'text', '{"html":"<p>Original unattested text</p>"}'::jsonb, 1, false);
  perform set_config('bmh.apply_import_id', '', true);

  v_release_catalog := public.fn_course_import_catalog_sha256('test-unattested-release-v2');
  perform set_config('bmh.release_import_id', 'test-unattested-release-v2', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'test-unattested-release-v2', v_program_id,
    '00000000-0000-6000-a000-000000000f33', '00000000-0000-6000-a000-000000000f34',
    repeat('1', 64), repeat('2', 64), v_release_catalog,
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'test-unattested-release-v2';
  update public.courses set is_published = true where content_import_id = 'test-unattested-release-v2';
  perform set_config('bmh.release_import_id', '', true);
  -- No release-anchor row exists (simulating an import released BEFORE
  -- fn_release_course_import_v1 started writing one) and there is no
  -- separate attestation column either -- this import's genesis is
  -- resolved ENTIRELY by trusting the receipt below.
  v_post_publish_catalog := public.fn_course_import_catalog_sha256('test-unattested-release-v2');

  update public.content_blocks
  set content = '{"html":"<p>Corrected unattested text</p>"}'::jsonb
  where id = v_text_block_id;
  v_after_content_catalog := public.fn_course_import_catalog_sha256('test-unattested-release-v2');
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence
  ) values (
    'test-unattested-release-v2',
    repeat('1', 64), repeat('1', 64), repeat('2', 64),
    v_post_publish_catalog, v_after_content_catalog, repeat('b', 64), repeat('c', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 1 or (v_result ->> 'first_events_trusted')::int <> 1 then
    raise exception 'the unattested-release backfill did not trust the lone genuine receipt as this import''s first-ever event: %', v_result;
  end if;
  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-unattested-release-v2' and revision = 2;
  if not found
    or v_mirror.kind <> 'content_blocks'
    or v_mirror.state_parent_revision <> 1
    or v_mirror.prior_catalog_sha256 <> v_post_publish_catalog
    or v_mirror.catalog_sha256 <> v_after_content_catalog
  then
    raise exception 'the unattested-release mirror row is missing or misshapen: %', to_jsonb(v_mirror);
  end if;
  if (
    select active_catalog_sha256 from public.content_import_active_release_v1
    where import_id = 'test-unattested-release-v2'
  ) <> v_after_content_catalog then
    raise exception 'the active-state view does not surface the trusted unattested-release backfill';
  end if;

  -- Idempotent: a second run must not re-trust this import's already
  -- resolved genesis (round-8 finding: the anchor-branch trust check can
  -- legitimately re-fire on every call, but must not be double-counted).
  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 0 or (v_result ->> 'first_events_trusted')::int <> 0 then
    raise exception 'the unattested-release backfill was not idempotent: %', v_result;
  end if;
end;
$$;

-- Positive path for the publication baseline + poster chain, built from
-- receipts whose hashes are REAL catalog checksums produced by actually
-- mutating the live rows (never invented placeholders): a released-poster
-- replacement ran between the original release and the first v1
-- content-block receipt, exactly as the retired RPCs would have recorded
-- them -- each receipt's prior catalog is the live hash before its own
-- mutation and its replacement is the live hash after it. The backfill must
-- attest the publication baseline (release record's PRE-publish capture ->
-- first live state), absorb the poster receipt as a validated
-- legacy_catalog_correction lineage row, and chain the content-block
-- receipt against the POSTER's resulting catalog, landing exactly on live.
do $$
declare
  v_program_id uuid := '00000000-0000-6000-a000-000000000f11';
  v_course_id uuid := '00000000-0000-6000-a000-000000000f12';
  v_module_id uuid := '00000000-0000-6000-a000-000000000f15';
  v_lesson_id uuid := '00000000-0000-6000-a000-000000000f16';
  v_video_block_id uuid := '00000000-0000-6000-a000-000000000f17';
  v_text_block_id uuid := '00000000-0000-6000-a000-000000000f18';
  v_release_catalog text;
  v_post_publish_catalog text;
  v_after_poster_catalog text;
  v_after_content_catalog text;
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
  insert into public.modules (id, course_id, title, sort_order)
  values (v_module_id, v_course_id, 'Round 6 Poster Chain Module', 1);
  insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id)
  values (v_lesson_id, v_module_id, 'Round 6 Poster Chain Lesson', 'content', 1, 'test-poster-chain-v2');
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  ) values
    (v_video_block_id, v_lesson_id, 'video',
     '{"video_path":"courses/poster-chain/v1/videos/slot-01.mp4","poster_path":"courses/poster-chain/v1/posters/slot-01.original.png"}'::jsonb,
     1, false),
    (v_text_block_id, v_lesson_id, 'text', '{"html":"<p>Original poster-chain text</p>"}'::jsonb, 2, false);
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
  -- The first live post-publication state (is_published is part of the
  -- hashed catalog rows, so this genuinely differs from the release
  -- record's pre-publish capture above). No attestation is stored for it
  -- (this fixture inserts the release record directly, bypassing
  -- fn_release_course_import_v1, so it never gets a real release-anchor
  -- ledger row either) -- the poster receipt below is simply the first-ever
  -- event for this import, and the backfill trusts its declared prior
  -- catalog directly (round-8 simplification).
  v_post_publish_catalog := public.fn_course_import_catalog_sha256('test-poster-chain-v2');
  perform set_config('bmh.release_import_id', '', true);

  -- The poster replacement's REAL effect and REAL hashes: mutate the poster
  -- path exactly as the retired RPC did, capturing live before/after.
  update public.content_blocks
  set content = jsonb_set(content, '{poster_path}',
    to_jsonb('courses/poster-chain/v1/posters/slot-01.redesigned.png'::text), false)
  where id = v_video_block_id;
  v_after_poster_catalog := public.fn_course_import_catalog_sha256('test-poster-chain-v2');

  alter table public.content_import_video_poster_replacement_records
    disable trigger content_import_video_poster_replacement_records_guard;
  insert into public.content_import_video_poster_replacement_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    approval_evidence_sha256, preflight_evidence_sha256,
    replacement_count, replacements, replaced_at
  ) values (
    'test-poster-chain-v2', v_post_publish_catalog, v_after_poster_catalog,
    repeat('6', 64), repeat('5', 64),
    repeat('4', 64), repeat('3', 64),
    1, jsonb_build_array(jsonb_build_object('block_id', v_video_block_id)),
    now() + interval '1 minute'
  );
  alter table public.content_import_video_poster_replacement_records
    enable trigger content_import_video_poster_replacement_records_guard;

  -- The v1 content correction's REAL effect and REAL hashes.
  update public.content_blocks
  set content = '{"html":"<p>Corrected poster-chain text</p>"}'::jsonb
  where id = v_text_block_id;
  v_after_content_catalog := public.fn_course_import_catalog_sha256('test-poster-chain-v2');

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
    -- Prior catalog is the POSTER fix's real resulting catalog, not the
    -- original release catalog -- the historically real shape this whole
    -- mechanism exists to accommodate.
    v_after_poster_catalog, v_after_content_catalog, repeat('9', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb,
    now() + interval '2 minutes'
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 2 or (v_result ->> 'first_events_trusted')::int <> 1 then
    raise exception 'v1 backfill did not absorb the poster correction plus the content-block receipt (trusting the poster receipt as the first-ever event): %', v_result;
  end if;

  -- The poster receipt is the very first event ever for this import: its
  -- declared prior catalog (the real post-publish state) is trusted
  -- directly, with no bridging row needed.
  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-poster-chain-v2' and revision = 2;
  if not found
    or v_mirror.kind <> 'legacy_catalog_correction'
    or v_mirror.state_parent_revision <> 1
    or v_mirror.prior_catalog_sha256 <> v_post_publish_catalog
    or v_mirror.catalog_sha256 <> v_after_poster_catalog
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
    or v_mirror.prior_catalog_sha256 <> v_after_poster_catalog
    or v_mirror.catalog_sha256 <> v_after_content_catalog
    or v_mirror.prior_manifest_sha256 <> repeat('1', 64)
    or v_mirror.manifest_sha256 <> repeat('2', 64)
  then
    raise exception 'the content-block receipt did not chain against the poster correction''s resulting catalog: %', to_jsonb(v_mirror);
  end if;
  if public.fn_current_state_revision('test-poster-chain-v2') <> 3 then
    raise exception 'the poster-chained lineage did not resolve to the final content-block revision';
  end if;
  if (
    select active_catalog_sha256 from public.content_import_active_release_v1
    where import_id = 'test-poster-chain-v2'
  ) <> v_after_content_catalog then
    raise exception 'the active-state view does not land on the chain''s real final catalog';
  end if;
end;
$$;

-- Round-6 finding 2 regression, the exact demanded shape: release -> poster
-- -> QUIZ REVISION -> caption -> content. Quiz ledger revisions are part of
-- the ONE causal sequence: the backfill replays receipts and existing quiz
-- rows in true chronological order, so a poster receipt BEFORE the quiz
-- chains against the pre-quiz state, the quiz anchor chains against the
-- poster's result, and the caption/content receipts chain on top of the
-- quiz's result -- an ordering the previous receipts-only queue could not
-- express (it compared every receipt against the post-quiz active view and
-- aborted on the earlier poster receipt).
do $$
declare
  v_program_id uuid := '00000000-0000-6000-a000-000000000f21';
  v_course_id uuid := '00000000-0000-6000-a000-000000000f22';
  v_module_id uuid := '00000000-0000-6000-a000-000000000f23';
  v_lesson_id uuid := '00000000-0000-6000-a000-000000000f24';
  v_quiz_lesson_id uuid := '00000000-0000-6000-a000-000000000f25';
  v_quiz_id uuid := '00000000-0000-6000-a000-000000000f26';
  v_video_block_id uuid := '00000000-0000-6000-a000-000000000f27';
  v_text_block_id uuid := '00000000-0000-6000-a000-000000000f28';
  v_release_catalog text;
  v_post_publish_catalog text;
  v_after_poster_catalog text;
  v_after_quiz_catalog text;
  v_after_caption_catalog text;
  v_after_content_catalog text;
  v_result jsonb;
  v_mirror public.content_import_release_revisions%rowtype;
begin
  perform set_config('bmh.apply_import_id', 'test-quiz-interleave-v2', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Round 6 Quiz Interleave Fixture', 'test-quiz-interleave-v2', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Round 6 Quiz Interleave Course', 'test-quiz-interleave-v2', false, false);
  insert into public.program_courses (program_id, course_id, sort_order)
  values (v_program_id, v_course_id, 0);
  insert into public.modules (id, course_id, title, sort_order)
  values (v_module_id, v_course_id, 'Round 6 Quiz Interleave Module', 1);
  insert into public.quizzes (id, title) values (v_quiz_id, 'Round 6 Interleave Quiz');
  insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id, quiz_id)
  values
    (v_lesson_id, v_module_id, 'Round 6 Interleave Lesson', 'content', 1, 'test-quiz-interleave-v2', null),
    (v_quiz_lesson_id, v_module_id, 'Round 6 Interleave Quiz Lesson', 'quiz', 2, 'test-quiz-interleave-v2', v_quiz_id);
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  ) values
    (v_video_block_id, v_lesson_id, 'video',
     '{"video_path":"courses/quiz-interleave/v1/videos/slot-01.mp4","poster_path":"courses/quiz-interleave/v1/posters/slot-01.original.png","caption_path":"courses/quiz-interleave/v1/captions/slot-01.original.vtt"}'::jsonb,
     1, false),
    (v_text_block_id, v_lesson_id, 'text', '{"html":"<p>Original interleave text</p>"}'::jsonb, 2, false);
  perform set_config('bmh.apply_import_id', '', true);

  v_release_catalog := public.fn_course_import_catalog_sha256('test-quiz-interleave-v2');
  perform set_config('bmh.release_import_id', 'test-quiz-interleave-v2', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'test-quiz-interleave-v2', v_program_id,
    '00000000-0000-6000-a000-000000000f29', '00000000-0000-6000-a000-000000000f2a',
    repeat('1', 64), repeat('2', 64), v_release_catalog,
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'test-quiz-interleave-v2';
  update public.courses set is_published = true where content_import_id = 'test-quiz-interleave-v2';
  v_post_publish_catalog := public.fn_course_import_catalog_sha256('test-quiz-interleave-v2');
  perform set_config('bmh.release_import_id', '', true);

  -- t+1: poster correction (real mutation, real hashes).
  update public.content_blocks
  set content = jsonb_set(content, '{poster_path}',
    to_jsonb('courses/quiz-interleave/v1/posters/slot-01.redesigned.png'::text), false)
  where id = v_video_block_id;
  v_after_poster_catalog := public.fn_course_import_catalog_sha256('test-quiz-interleave-v2');
  alter table public.content_import_video_poster_replacement_records
    disable trigger content_import_video_poster_replacement_records_guard;
  insert into public.content_import_video_poster_replacement_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    approval_evidence_sha256, preflight_evidence_sha256,
    replacement_count, replacements, replaced_at
  ) values (
    'test-quiz-interleave-v2', v_post_publish_catalog, v_after_poster_catalog,
    repeat('6', 64), repeat('5', 64), repeat('4', 64), repeat('3', 64),
    1, jsonb_build_array(jsonb_build_object('block_id', v_video_block_id)),
    now() + interval '1 minute'
  );
  alter table public.content_import_video_poster_replacement_records
    enable trigger content_import_video_poster_replacement_records_guard;

  -- t+2: a QUIZ revision (real quiz-graph mutation, real hashes) recorded
  -- directly in the shared ledger, exactly as the quiz mechanism writes it.
  update public.quizzes set title = 'Round 6 Interleave Quiz (revised)'
  where id = v_quiz_id;
  v_after_quiz_catalog := public.fn_course_import_catalog_sha256('test-quiz-interleave-v2');
  perform set_config('bmh.release_revision_import_id', 'test-quiz-interleave-v2', true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256,
    quiz_count, question_count, option_count,
    prior_quiz_graph, invalidated_incomplete_attempts, evidence, revised_at
  ) values (
    'test-quiz-interleave-v2', 2, 'quiz',
    repeat('1', 64), repeat('e', 64),
    v_after_poster_catalog, v_after_quiz_catalog, repeat('a', 64),
    1, 1, 1, '[]'::jsonb, '[]'::jsonb, '{"operation":"release"}'::jsonb,
    now() + interval '2 minutes'
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  -- t+3: caption correction (real mutation, real hashes).
  update public.content_blocks
  set content = jsonb_set(content, '{caption_path}',
    to_jsonb('courses/quiz-interleave/v1/captions/slot-01.corrected.vtt'::text), false)
  where id = v_video_block_id;
  v_after_caption_catalog := public.fn_course_import_catalog_sha256('test-quiz-interleave-v2');
  alter table public.content_import_video_caption_replacement_records
    disable trigger content_import_video_caption_replacement_records_guard;
  insert into public.content_import_video_caption_replacement_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    approval_evidence_sha256, replacement_count, replacements, replaced_at
  ) values (
    'test-quiz-interleave-v2', v_after_quiz_catalog, v_after_caption_catalog,
    repeat('7', 64), repeat('5', 64), repeat('4', 64),
    1, jsonb_build_array(jsonb_build_object('block_id', v_video_block_id)),
    now() + interval '3 minutes'
  );
  alter table public.content_import_video_caption_replacement_records
    enable trigger content_import_video_caption_replacement_records_guard;

  -- t+4: the v1 content-block correction (real mutation, real hashes). Its
  -- declared predecessor manifest is the QUIZ revision's -- the quiz was
  -- the last manifest-changing event before it.
  update public.content_blocks
  set content = '{"html":"<p>Corrected interleave text</p>"}'::jsonb
  where id = v_text_block_id;
  v_after_content_catalog := public.fn_course_import_catalog_sha256('test-quiz-interleave-v2');
  alter table public.content_import_released_content_block_revision_records
    disable trigger content_import_released_content_block_revision_records_guard;
  insert into public.content_import_released_content_block_revision_records (
    import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
    manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    guide_update_count, flashcard_update_count, role_play_insert_count,
    mutations, evidence, revised_at
  ) values (
    'test-quiz-interleave-v2',
    repeat('1', 64), repeat('e', 64), repeat('f', 64),
    v_after_caption_catalog, v_after_content_catalog, repeat('9', 64), repeat('d', 64),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb,
    now() + interval '4 minutes'
  );
  alter table public.content_import_released_content_block_revision_records
    enable trigger content_import_released_content_block_revision_records_guard;

  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 3 or (v_result ->> 'first_events_trusted')::int <> 1 then
    raise exception 'v1 backfill did not absorb poster + caption + content around the quiz anchor (trusting the poster receipt as the first-ever event): %', v_result;
  end if;

  -- Poster mirror (rev 3): trusted directly as the first-ever event for
  -- this import (round-8 simplification -- no separate publication-baseline
  -- row is created anymore; the poster receipt's own declared prior catalog
  -- is trusted directly since it was already CAS-verified live by its own
  -- creating RPC).
  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-quiz-interleave-v2' and revision = 3;
  if not found
    or v_mirror.kind <> 'legacy_catalog_correction'
    or v_mirror.state_parent_revision <> 1
    or v_mirror.prior_catalog_sha256 <> v_post_publish_catalog
    or v_mirror.catalog_sha256 <> v_after_poster_catalog
    or v_mirror.manifest_sha256 <> repeat('1', 64)
  then
    raise exception 'the pre-quiz poster mirror did not chain against the pre-quiz state: %', to_jsonb(v_mirror);
  end if;
  -- Caption mirror (rev 4) chains from the QUIZ anchor's resulting state.
  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-quiz-interleave-v2' and revision = 4;
  if not found
    or v_mirror.kind <> 'legacy_catalog_correction'
    or v_mirror.state_parent_revision <> 2
    or v_mirror.prior_catalog_sha256 <> v_after_quiz_catalog
    or v_mirror.catalog_sha256 <> v_after_caption_catalog
    or v_mirror.manifest_sha256 <> repeat('e', 64)
  then
    raise exception 'the post-quiz caption mirror did not chain against the quiz anchor: %', to_jsonb(v_mirror);
  end if;
  -- Content mirror (rev 5): declared predecessor manifest is the QUIZ
  -- revision's, proving quiz revisions are inside the validated chain.
  select * into v_mirror
  from public.content_import_release_revisions
  where import_id = 'test-quiz-interleave-v2' and revision = 5;
  if not found
    or v_mirror.kind <> 'content_blocks'
    or v_mirror.state_parent_revision <> 4
    or v_mirror.prior_manifest_sha256 <> repeat('e', 64)
    or v_mirror.manifest_sha256 <> repeat('f', 64)
    or v_mirror.prior_catalog_sha256 <> v_after_caption_catalog
    or v_mirror.catalog_sha256 <> v_after_content_catalog
  then
    raise exception 'the content mirror did not chain through the quiz revision: %', to_jsonb(v_mirror);
  end if;
  if public.fn_current_state_revision('test-quiz-interleave-v2') <> 5 then
    raise exception 'the interleaved lineage did not resolve to the final content revision';
  end if;
  if (
    select active_catalog_sha256 from public.content_import_active_release_v1
    where import_id = 'test-quiz-interleave-v2'
  ) <> v_after_content_catalog then
    raise exception 'the active-state view does not land on the interleaved chain''s final catalog';
  end if;

  -- Round-7 review finding 4 (renumbered round-8: the publication-baseline
  -- row no longer exists -- the poster mirror at revision 3 is now the
  -- first-ever event, trusted directly): revision 3 (poster mirror)
  -- causally precedes the quiz revision (2), which already absorbed its
  -- effect into ITS OWN live catalog when it was originally applied -- but
  -- the quiz row's own immutable state_parent_revision still points at 1
  -- (it was created before this backfill ever ran, so it cannot be
  -- rewritten to point at 3). Without the absorbed_into_revision edge, a
  -- state_parent-only walk from head=5 (5->4->2->1) never visits 3, and it
  -- classifies diverged instead of superseded. Assert it reaches
  -- superseded, and that the chain stays reachable through a rollback of
  -- the head too (ancestry survives past a rollback receipt).
  if public.fn_classify_revision_lineage('test-quiz-interleave-v2', 3) <> 'superseded' then
    raise exception 'the pre-quiz poster mirror (revision 3) did not classify as superseded under the interleaved head -- finding 4 regressed';
  end if;
  if public.fn_classify_revision_lineage('test-quiz-interleave-v2', 2) <> 'superseded' then
    raise exception 'the quiz anchor (revision 2) did not classify as superseded under the interleaved head';
  end if;
  if public.fn_classify_revision_lineage('test-quiz-interleave-v2', 4) <> 'superseded' then
    raise exception 'the post-quiz caption mirror (revision 4) did not classify as superseded under the interleaved head';
  end if;

  -- Idempotency across the interleave too. Deliberately BEFORE the
  -- synthetic rollback insert below: that insert is a ledger-only fixture
  -- (it never actually reverts the real content_blocks row), so a backfill
  -- re-run AFTER it would fail the mandatory live-catalog reality check on
  -- a mismatch this test intentionally creates for the lineage classifier,
  -- not a real inconsistency.
  v_result := public.fn_backfill_v1_content_block_revisions();
  if (v_result ->> 'rows')::int <> 0 or (v_result ->> 'first_events_trusted')::int <> 0 then
    raise exception 'the interleave backfill was not idempotent: %', v_result;
  end if;

  -- Roll back the head (content revision 5) and re-check: 3 must stay
  -- reachable as an ancestor of the RESTORED state (revision 4), not just
  -- of the since-reverted head. A synthetic rollback receipt is
  -- inserted directly here (the real RPC's live-state-matching checks need
  -- the mutations array to hold REAL per-block replacement content, which
  -- this fixture's 44-entry v1-shaped placeholder mutations are not built
  -- to satisfy -- exactly the same lightweight-fixture technique the
  -- quiz-lineage classification tests elsewhere in this file already use to
  -- exercise the classifier without a full RPC round trip): it carries the
  -- exact shape a real rollback of revision 6 would produce.
  perform set_config('bmh.release_revision_import_id', 'test-quiz-interleave-v2', true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, reverts_revision, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256, client_payload_sha256,
    download_evidence_sha256, mutation_count, update_count, insert_count,
    mutations, prior_block_graph, evidence, revised_at
  ) values (
    'test-quiz-interleave-v2', 6, 'content_blocks', 5, 4,
    repeat('f', 64), repeat('e', 64),
    v_after_content_catalog, v_after_caption_catalog, repeat('9', 64), repeat('d', 64),
    encode(sha256(convert_to('[]'::jsonb::text, 'UTF8')), 'hex'),
    19, 19, 6,
    (select jsonb_agg(jsonb_build_object('fixture', item)) from generate_series(1, 44) item),
    '{}'::jsonb,
    jsonb_build_object('operation', 'rollback', 'rollback_sha256', repeat('1', 64)),
    now() + interval '5 minutes'
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  if public.fn_current_state_revision('test-quiz-interleave-v2') <> 4 then
    raise exception 'the synthetic rollback receipt did not restore revision 4 as the current state';
  end if;
  if public.fn_classify_revision_lineage('test-quiz-interleave-v2', 5) <> 'reverted' then
    raise exception 'the rolled-back content revision did not classify as reverted';
  end if;
  if public.fn_classify_revision_lineage('test-quiz-interleave-v2', 3) <> 'superseded' then
    raise exception 'the pre-quiz poster mirror lost its ancestry after rolling back the head -- absorbed_into_revision must survive rollback';
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
-- one the caller's browser loaded. Runs on its OWN freshly released
-- import, not test-content-block-revision-v2: the round-8 finding 4 fix
-- makes fn_admin_merge_role_play_block_content refuse outright (not just
-- mismatch rows) whenever an import's live catalog does not match its
-- active ledger revision, and test-content-block-revision-v2 deliberately
-- drifts out of sync in the direct insert-guard test just above (a real
-- content_blocks row inserted with no corresponding ledger receipt) --
-- exactly the unrecorded catalog movement that check exists to catch. A
-- clean import proves the merge's own CAS mechanics instead of that
-- (already-covered-by-design) refusal path.
do $$
declare
  v_program_id uuid := '05500000-0000-5000-a000-00000000f101';
  v_course_id uuid := '05500000-0000-5000-a000-00000000f102';
  v_module_id uuid := '05500000-0000-5000-a000-00000000f103';
  v_lesson_id uuid := '05500000-0000-5000-a000-00000000f104';
  v_text_block_id uuid := '05500000-0000-5000-a000-00000000f105';
  v_role_play_block_id uuid := '05500000-0000-5000-a000-00000000f106';
  v_release_catalog text;
  v_post_publish_catalog text;
  v_merged jsonb;
begin
  perform set_config('bmh.apply_import_id', 'test-role-play-merge-v2', true);
  insert into public.programs (id, title, content_import_id, is_published, certificate_enabled)
  values (v_program_id, 'Role-Play Merge Fixture', 'test-role-play-merge-v2', false, true);
  insert into public.courses (id, title, content_import_id, is_published, certificate_enabled)
  values (v_course_id, 'Role-Play Merge Course', 'test-role-play-merge-v2', false, false);
  insert into public.program_courses (program_id, course_id, sort_order)
  values (v_program_id, v_course_id, 0);
  insert into public.modules (id, course_id, title, sort_order)
  values (v_module_id, v_course_id, 'Role-Play Merge Module', 1);
  insert into public.lessons (id, module_id, title, lesson_type, sort_order, content_import_id)
  values (v_lesson_id, v_module_id, 'Role-Play Merge Lesson', 'content', 1, 'test-role-play-merge-v2');
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
  ) values
    (v_text_block_id, v_lesson_id, 'text', '{"html":"<p>Not role play</p>"}'::jsonb, 1, false),
    (v_role_play_block_id, v_lesson_id, 'role_play',
     '{"mode":"oral_check","scenario_id":"pending:merge","scenario_spec":{"context":"spec"},"title":"Before","height_px":760}'::jsonb,
     2, false);
  perform set_config('bmh.apply_import_id', '', true);

  v_release_catalog := public.fn_course_import_catalog_sha256('test-role-play-merge-v2');
  perform set_config('bmh.release_import_id', 'test-role-play-merge-v2', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'test-role-play-merge-v2', v_program_id,
    '05500000-0000-5000-a000-00000000f107', '05500000-0000-5000-a000-00000000f108',
    repeat('1', 64), repeat('2', 64), v_release_catalog,
    repeat('4', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
    repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'test-role-play-merge-v2';
  update public.courses set is_published = true where content_import_id = 'test-role-play-merge-v2';
  perform set_config('bmh.release_import_id', '', true);

  -- A real release-anchor ledger row -- mirrors exactly what
  -- fn_release_course_import_v1 itself now inserts under lock (see
  -- 20260727180000) -- so the active view is genuinely in sync with the
  -- POST-publication catalog from the start, exactly like a real release,
  -- and the merge's adjacency check has real lineage to prove against.
  v_post_publish_catalog := public.fn_course_import_catalog_sha256('test-role-play-merge-v2');
  perform set_config('bmh.release_revision_import_id', 'test-role-play-merge-v2', true);
  insert into public.content_import_release_revisions (
    import_id, revision, kind, state_parent_revision,
    prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256,
    payload_sha256, client_payload_sha256,
    evidence, revised_at
  ) values (
    'test-role-play-merge-v2', 2, 'legacy_catalog_correction', 1,
    repeat('1', 64), repeat('1', 64),
    v_release_catalog, v_post_publish_catalog,
    v_post_publish_catalog, v_post_publish_catalog,
    jsonb_build_object('operation', 'release_anchor'), now()
  );
  perform set_config('bmh.release_revision_import_id', '', true);

  -- The fixture's own text block: the merge must not touch it.
  if public.fn_admin_merge_role_play_block_content(
    v_text_block_id, 'scenario-x', 'scenario-x', 'Title', 700, false
  ) is not null then
    raise exception 'the role-play merge touched a non-role_play block';
  end if;

  -- Compare-and-swap refusal: the caller loaded a STALE scenario binding
  -- (as if a publication rebound the block after their page load). Nothing
  -- may be written -- not even the title -- or the stale binding would be
  -- written back over the live one.
  if public.fn_admin_merge_role_play_block_content(
    v_role_play_block_id, 'pending:stale-binding', 'pending:stale-binding', 'Hijacked title', 700, true
  ) is not null then
    raise exception 'the merge accepted a stale scenario binding';
  end if;
  if (
    select content ->> 'title' from public.content_blocks where id = v_role_play_block_id
  ) <> 'Before' then
    raise exception 'the refused stale merge still modified the row';
  end if;

  v_merged := public.fn_admin_merge_role_play_block_content(
    v_role_play_block_id, 'pending:merge', 'pending:merge', 'After', 800, true
  );
  if v_merged is distinct from
    '{"mode":"oral_check","scenario_id":"pending:merge","scenario_spec":{"context":"spec"},"title":"After","height_px":800}'::jsonb
  then
    raise exception 'the atomic merge did not preserve untouched content keys: %', v_merged;
  end if;
  if not exists (
    select 1 from public.content_blocks
    where id = v_role_play_block_id and is_required_for_completion
  ) then
    raise exception 'the atomic merge did not persist the required flag';
  end if;

  -- Finding 4's whole point: the merge must append a REAL ledger receipt
  -- parented to the PROVEN-ADJACENT active revision (2), not to an
  -- unproven or fabricated one.
  if not exists (
    select 1 from public.content_import_release_revisions
    where import_id = 'test-role-play-merge-v2'
      and kind = 'legacy_catalog_correction'
      and state_parent_revision = 2
      and evidence ->> 'operation' = 'admin_role_play_scenario_bind'
  ) then
    raise exception 'the merge did not append a ledger receipt parented to the proven-adjacent active revision';
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
