begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- Structural: the rollback function and its evidence table must exist.
do $$
begin
  if to_regprocedure(
    'public.fn_rollback_oral_check_pilot_role_play_blocks()'
  ) is null then
    raise exception 'oral-check pilot role-play rollback function is absent';
  end if;
  if to_regclass(
    'public.content_import_oral_check_pilot_role_play_rollback_records'
  ) is null then
    raise exception 'oral-check pilot role-play rollback audit table is absent';
  end if;
end;
$$;

-- Authorization: only service_role may run this.
do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'authenticated caller ran the oral-check pilot rollback';
  exception when sqlstate '42501' then
    if sqlerrm not like '%requires service_role%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$$;

-- Nothing to roll back: no forward insertion evidence exists at all (true
-- of every fresh database, including this one before the fixture below).
do $$
begin
  perform public.fn_rollback_oral_check_pilot_role_play_blocks();
  raise exception 'the rollback ran with no forward insertion evidence at all';
exception when sqlstate '42501' then
  if sqlerrm not like '%no forward insertion evidence exists%' then raise; end if;
end;
$$;

-- The evidence table's own guard: nobody may insert directly, even
-- service_role, without the exact marker + payload hash the function sets.
do $$
begin
  begin
    insert into public.content_import_oral_check_pilot_role_play_rollback_records (
      import_id, forward_database_payload_sha256, removed_catalog_sha256,
      restored_catalog_sha256, role_play_removed_count, removed_block_ids, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64), repeat('3', 64),
      3, array[
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      ]::uuid[],
      '{}'::jsonb
    );
    raise exception 'a direct unmarked insert into the rollback evidence table was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;
end;
$$;

-- Rehearse the rollback against a REAL database state that already has the
-- insertion applied: the same real production program/course/module/lesson
-- fixture and fn_course_import_catalog_sha256 stub 056 uses, so the actual
-- fn_insert_oral_check_pilot_role_play_blocks() runs for real first, then
-- fn_rollback_oral_check_pilot_role_play_blocks() is exercised against that
-- genuine post-insert state -- not a simulated evidence row.
savepoint oral_check_pilot_rollback_rehearsal;

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

  insert into public.modules (id, course_id, title, description, sort_order) values
    ('b2b26858-4b5c-5e1f-ada4-6814d3c340fe', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Orientation', 'Learn the BMH Group service standard, vocabulary, and operating tools.', 1),
    ('2cf8bd25-600c-5514-a88f-bd964bbd6616', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Who We Serve', 'Understand the sellers BMH Group can help and the tradeoffs in our offer.', 2),
    ('774aa2b9-6460-572c-a8bf-a000020fdfd5', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Performance and Career', 'Use scorecards, operating discipline, and coaching to improve and grow.', 6);

  insert into public.lessons (
    id, module_id, title, description, lesson_type, sort_order,
    content_import_id, is_required_for_completion
  ) values
    ('dc391d4b-58f4-5a94-a97f-ca59c4d98f41', 'b2b26858-4b5c-5e1f-ada4-6814d3c340fe', 'Real Estate Terms Glossary', 'Build the vocabulary needed to follow property, title, financing, and transaction conversations without guessing.', 'content', 3, 'bmh-employee-training-v1', true),
    ('823f016f-6e4c-5791-ac42-9f24c28040df', '2cf8bd25-600c-5514-a88f-bd964bbd6616', 'The BMH Offer Playbook', 'Explain how a direct property purchase exchanges maximum retail price for speed, certainty, convenience, and an as-is sale.', 'content', 3, 'bmh-employee-training-v1', true),
    ('cccdb0ef-b907-5bce-ade1-3ff0b0d054ce', '774aa2b9-6460-572c-a8bf-a000020fdfd5', 'KPIs and Sales Telemetry', 'Read the funnel from left to right to locate process gaps and choose the right coaching response.', 'content', 1, 'bmh-employee-training-v1', true);

  perform set_config('bmh.apply_import_id', '', true);

  perform set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'bmh-employee-training-v1', '15a382c9-617c-5407-a880-af6303be74b2',
    '05701000-0000-5000-a000-000000000001', '05701000-0000-5000-a000-000000000002',
    '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c',
    repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('6', 64), repeat('7', 64), repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);
end;
$$;

-- The genuine forward insertion this rollback will be rehearsed against.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_insert_oral_check_pilot_role_play_blocks();
  if v_result ->> 'status' <> 'inserted' then
    raise exception 'fixture forward insertion did not succeed: %', v_result;
  end if;
end;
$$;

-- Guard: the payload of one of the 3 target rows no longer exactly matches
-- the forward operation's own recorded mutations (simulating a hand edit
-- after insertion) -- the rollback must refuse, not silently remove a row
-- whose live content no longer matches what was actually inserted.
savepoint before_payload_tamper;
do $$
begin
  update public.content_blocks
  set content = content || '{"height_px": 761}'::jsonb
  where id = '7300bba9-a9fc-582c-aa20-dd5d58754165';

  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'the rollback ran against a tampered target row payload';
  exception when sqlstate '40001' then
    if sqlerrm not like '%no longer exactly match the forward operation%' then raise; end if;
  end;

  if not exists (
    select 1 from public.content_blocks
    where id = '7300bba9-a9fc-582c-aa20-dd5d58754165'
  ) then
    raise exception 'the refused rollback removed a row despite refusing';
  end if;
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_rollback_records
  ) then
    raise exception 'the refused rollback left a rollback evidence row behind';
  end if;
end;
$$;
rollback to savepoint before_payload_tamper;

-- Guard: the live catalog no longer matches the forward operation's own
-- recorded post-insert (replacement_catalog_sha256) state -- simulating an
-- unrelated catalog change since the pilot insertion. The rollback must
-- refuse rather than mechanically remove 3 rows out from under an unknown,
-- unreviewed change.
savepoint before_catalog_drift;
do $$
begin
  create or replace function public.fn_course_import_catalog_sha256(p_import_id text)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
  as $stub$
    select repeat('9', 64);
  $stub$;

  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'the rollback ran against a drifted catalog hash';
  exception when sqlstate '40001' then
    if sqlerrm not like '%no longer matches the forward operation%post-insert state%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )) <> 3 then
    raise exception 'the refused rollback changed the target row count';
  end if;
end;
$$;
rollback to savepoint before_catalog_drift;

-- Guard: real learner activity exists against one of the 3 target blocks
-- (role_play_results) -- the rollback must refuse rather than silently
-- ON DELETE CASCADE that data away.
savepoint before_role_play_result_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '05705705-7057-4057-8057-057057057057',
    'authenticated', 'authenticated',
    'migration-057-rollback-learner@bmh.invalid',
    crypt('Migration057RollbackLearner!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 057 Rollback Learner"}'::jsonb, now(), now()
  );
  insert into public.role_play_results (
    user_id, block_id, scenario_id, attempt_id, score
  ) values (
    '05705705-7057-4057-8057-057057057057',
    '7300bba9-a9fc-582c-aa20-dd5d58754165',
    'e46baf56-d0ae-4621-87f3-07718f0744b2',
    'attempt-057-rollback-rehearsal',
    88
  );

  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'the rollback ran despite real role_play_results learner activity';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )) <> 3 then
    raise exception 'the refused rollback changed the target row count despite learner activity';
  end if;
end;
$$;
rollback to savepoint before_role_play_result_activity;

-- Guard: real learner activity exists against one of the 3 target blocks
-- (user_block_progress) -- same refusal, different activity table.
savepoint before_user_block_progress_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '05705705-7057-4057-8057-057057057058',
    'authenticated', 'authenticated',
    'migration-057-rollback-progress@bmh.invalid',
    crypt('Migration057RollbackProgress!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 057 Rollback Progress"}'::jsonb, now(), now()
  );
  insert into public.user_block_progress (user_id, block_id) values (
    '05705705-7057-4057-8057-057057057058',
    '4464ecdd-2650-59ed-a525-78871e846d20'
  );

  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'the rollback ran despite real user_block_progress learner activity';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )) <> 3 then
    raise exception 'the refused rollback changed the target row count despite progress activity';
  end if;
end;
$$;
rollback to savepoint before_user_block_progress_activity;

-- Round-5 review: the round-4 activity guard added user_video_progress and
-- user_video_completion_history to the lock list and the zero-activity
-- check, but nothing exercised either table with real rows -- prove both
-- refusal paths actually fire, not just that the SQL text mentions them.
-- user_video_progress is ON DELETE CASCADE on content_blocks.id (silent
-- data loss if the guard did not catch it); user_video_completion_history
-- is ON DELETE RESTRICT (an uncontrolled foreign-key-violation exception,
-- not this function's own controlled refusal, if the guard did not catch
-- it first).
savepoint before_user_video_progress_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '05705705-7057-4057-8057-057057057059',
    'authenticated', 'authenticated',
    'migration-057-rollback-video-progress@bmh.invalid',
    crypt('Migration057RollbackVideoProgress!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 057 Rollback Video Progress"}'::jsonb, now(), now()
  );
  insert into public.user_video_progress (
    user_id, block_id, position_seconds, duration_seconds,
    watched_ranges, last_observed_position_seconds, asset_version
  ) values (
    '05705705-7057-4057-8057-057057057059',
    '34758403-1ddd-5e3c-a054-b2f28310d8b8',
    30, 90, '[[0,30]]'::jsonb, 30,
    'malformed-or-direct-write-test-asset-version'
  );

  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'the rollback ran despite real user_video_progress activity';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )) <> 3 then
    raise exception 'the refused rollback changed the target row count despite video-progress activity';
  end if;
  if not exists (
    select 1 from public.user_video_progress
    where user_id = '05705705-7057-4057-8057-057057057059'
      and block_id = '34758403-1ddd-5e3c-a054-b2f28310d8b8'
  ) then
    raise exception 'the refused rollback silently removed the user_video_progress row it was supposed to refuse over';
  end if;
end;
$$;
rollback to savepoint before_user_video_progress_activity;

savepoint before_user_video_completion_history_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '05705705-7057-4057-8057-057057057060',
    'authenticated', 'authenticated',
    'migration-057-rollback-video-completion@bmh.invalid',
    crypt('Migration057RollbackVideoCompletion!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 057 Rollback Video Completion"}'::jsonb, now(), now()
  );
  -- user_video_completion_history is ON DELETE RESTRICT on both user_id and
  -- block_id -- if the rollback's own precondition check did not catch
  -- this first, the later `delete from public.content_blocks` would hit an
  -- uncontrolled foreign_key_violation (SQLSTATE 23503) instead of this
  -- function's own clear, controlled refusal (SQLSTATE 40001). Assert the
  -- controlled refusal happens, not the raw FK error.
  insert into public.user_video_completion_history (user_id, block_id, asset_version) values (
    '05705705-7057-4057-8057-057057057060',
    '7300bba9-a9fc-582c-aa20-dd5d58754165',
    'malformed-or-direct-write-test-asset-version'
  );

  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'the rollback ran despite real user_video_completion_history activity';
  exception
    when sqlstate '40001' then
      if sqlerrm not like '%real learner activity exist%' then raise; end if;
    when sqlstate '23503' then
      raise exception 'the rollback hit an uncontrolled foreign-key violation instead of its own controlled refusal -- the learner-activity guard did not catch user_video_completion_history activity first: %', sqlerrm;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        '7300bba9-a9fc-582c-aa20-dd5d58754165',
        '4464ecdd-2650-59ed-a525-78871e846d20',
        '34758403-1ddd-5e3c-a054-b2f28310d8b8'
      )) <> 3 then
    raise exception 'the refused rollback changed the target row count despite video-completion-history activity';
  end if;
end;
$$;
rollback to savepoint before_user_video_completion_history_activity;

-- The genuine end-to-end rollback: every guard above now passes for real
-- (untampered payload, undrifted catalog, zero learner activity), so this
-- reaches the actual DELETE, exact-restoration verification, and guarded
-- rollback-evidence write -- the exact rehearsal finding 3 required.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_rollback_oral_check_pilot_role_play_blocks();
  if v_result ->> 'status' <> 'rolled_back' then
    raise exception 'expected status=rolled_back, got %', v_result;
  end if;
  if v_result ->> 'import_id' <> 'bmh-employee-training-v1' then
    raise exception 'unexpected import_id in rollback result: %', v_result;
  end if;
  if (v_result ->> 'role_play_removed_count')::integer <> 3 then
    raise exception 'expected role_play_removed_count=3, got %', v_result;
  end if;
  if v_result ->> 'removed_catalog_sha256' <> repeat('f', 64) then
    raise exception 'unexpected removed_catalog_sha256 in rollback result: %', v_result;
  end if;
  -- This is the load-bearing assertion: the catalog hash is restored to
  -- the EXACT prior (pre-insert) value the forward operation itself
  -- recorded and validated against production before it ever ran.
  if v_result ->> 'restored_catalog_sha256' <> '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2' then
    raise exception 'restored_catalog_sha256 does not match the exact pre-insert production value: %', v_result;
  end if;
end;
$$;

-- All 3 rows are gone, nothing else was touched.
do $$
begin
  if exists (
    select 1 from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) then
    raise exception 'a target row survived the real rollback';
  end if;
  if (select count(*) from public.lessons where content_import_id = 'bmh-employee-training-v1') <> 3 then
    raise exception 'the rollback touched lessons outside its own 3 target rows';
  end if;
end;
$$;

-- The forward evidence row is untouched -- it remains permanent historical
-- proof the insertion happened; the rollback never overwrites or deletes it.
do $$
begin
  if (select count(*) from public.content_import_oral_check_pilot_role_play_records
      where import_id = 'bmh-employee-training-v1') <> 1 then
    raise exception 'the rollback altered the forward evidence row count';
  end if;
end;
$$;

-- The rollback evidence row: exact hashes, removed block ids, and evidence.
do $$
declare
  v_receipt public.content_import_oral_check_pilot_role_play_rollback_records%rowtype;
begin
  select * into v_receipt
  from public.content_import_oral_check_pilot_role_play_rollback_records
  where import_id = 'bmh-employee-training-v1';
  if not found then
    raise exception 'no rollback evidence row was written for the successful rollback';
  end if;
  if v_receipt.forward_database_payload_sha256 <> '893405d59d508783cbb96bb543ab41080337fa6aa06f92a106c10962c5fcfce5' then
    raise exception 'rollback evidence forward_database_payload_sha256 mismatch: %', v_receipt.forward_database_payload_sha256;
  end if;
  if v_receipt.removed_catalog_sha256 <> repeat('f', 64) then
    raise exception 'rollback evidence removed_catalog_sha256 mismatch: %', v_receipt.removed_catalog_sha256;
  end if;
  if v_receipt.restored_catalog_sha256 <> '91bee07c6626d0d113291d925cfc7fa65ac26c57c7d85ea3ca172d5b706120f2' then
    raise exception 'rollback evidence restored_catalog_sha256 mismatch: %', v_receipt.restored_catalog_sha256;
  end if;
  if v_receipt.role_play_removed_count <> 3 then
    raise exception 'rollback evidence role_play_removed_count mismatch: %', v_receipt.role_play_removed_count;
  end if;
  if v_receipt.removed_block_ids <> array[
    '7300bba9-a9fc-582c-aa20-dd5d58754165',
    '4464ecdd-2650-59ed-a525-78871e846d20',
    '34758403-1ddd-5e3c-a054-b2f28310d8b8'
  ]::uuid[] then
    raise exception 'rollback evidence removed_block_ids mismatch: %', v_receipt.removed_block_ids;
  end if;
  if v_receipt.evidence -> 'lesson_source_keys' <> jsonb_build_array(
    'lesson-content-slot-02', 'lesson-content-slot-05', 'lesson-content-slot-16'
  ) then
    raise exception 'rollback evidence.lesson_source_keys mismatch: %', v_receipt.evidence;
  end if;
end;
$$;

-- Genuinely one-shot: a second invocation must be refused unconditionally,
-- not silently re-verified into a no-op success.
do $$
begin
  begin
    perform public.fn_rollback_oral_check_pilot_role_play_blocks();
    raise exception 'a second rollback invocation after a real successful rollback was not refused';
  exception when sqlstate '40001' then
    if sqlerrm not like '%this one-shot rollback has already been performed%' then raise; end if;
  end;
  if (select count(*) from public.content_import_oral_check_pilot_role_play_rollback_records
      where import_id = 'bmh-employee-training-v1') <> 1 then
    raise exception 'the refused second rollback changed the rollback evidence count';
  end if;
end;
$$;

rollback to savepoint oral_check_pilot_rollback_rehearsal;

rollback;
