begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- Regression suite for
-- 20260730060500_rollback_objection_oral_check_role_play_blocks.sql,
-- mirroring supabase/tests/057_oral_check_pilot_role_play_rollback.sql's
-- structure and coverage, scaled from the pilot's 3 blocks to this
-- operation's 2.

-- Structural: the rollback function and its evidence table must exist.
do $$
begin
  if to_regprocedure(
    'public.fn_rollback_oral_check_objections_role_play_blocks()'
  ) is null then
    raise exception 'oral-check objections role-play rollback function is absent';
  end if;
  if to_regclass(
    'public.content_import_oral_check_objections_rollback_records'
  ) is null then
    raise exception 'oral-check objections role-play rollback audit table is absent';
  end if;
end;
$$;

-- Authorization: only service_role may run this.
do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'authenticated caller ran the oral-check objections rollback';
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
  perform public.fn_rollback_oral_check_objections_role_play_blocks();
  raise exception 'the rollback ran with no forward insertion evidence at all';
exception when sqlstate '42501' then
  if sqlerrm not like '%no forward insertion evidence exists%' then raise; end if;
end;
$$;

-- Rehearse the rollback against a REAL database state that already has the
-- insertion applied: the same real production program/course/module/lesson
-- fixture and fn_course_import_catalog_sha256 stub 065 uses, so the actual
-- fn_insert_oral_check_objections_role_play_blocks() runs for real first,
-- then fn_rollback_oral_check_objections_role_play_blocks() is exercised
-- against that genuine post-insert state -- not a simulated evidence row.
savepoint oral_check_objections_rollback_rehearsal;

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
    ('70cfc9e3-bf2c-54b8-ab2a-2e71306936de', 'e743b27c-7e0d-5760-aa25-5dbd75656718', 'Objections and Questions', 'Respond to concerns with empathy, structure, and accurate process information.', 4);

  insert into public.lessons (
    id, module_id, title, description, lesson_type, sort_order,
    content_import_id, is_required_for_completion
  ) values
    ('25973272-2cfc-5357-ae82-18ed08db636b', '70cfc9e3-bf2c-54b8-ab2a-2e71306936de', 'Objection Architecture', 'Use a repeatable framework to understand concerns before selecting a response.', 'content', 1, 'bmh-employee-training-v1', true),
    ('29ab8578-76cb-5fe2-ab68-b9e097e570ed', '70cfc9e3-bf2c-54b8-ab2a-2e71306936de', 'Objection Scripts Playbook', 'Practice adaptable responses for price, timing, trust, competition, and decision-maker concerns.', 'content', 3, 'bmh-employee-training-v1', true);

  perform set_config('bmh.apply_import_id', '', true);

  perform set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
  insert into public.content_import_release_records (
    import_id, program_id, qa_role_group_id, employee_role_group_id,
    manifest_sha256, reconciliation_sha256, catalog_sha256,
    rollback_rehearsal_sha256, chrome_desktop_sha256, chrome_mobile_sha256,
    admin_happy_path_sha256, approval_sha256, approved_by, evidence
  ) values (
    'bmh-employee-training-v1', '15a382c9-617c-5407-a880-af6303be74b2',
    '06601000-0000-5000-a000-000000000001', '06601000-0000-5000-a000-000000000002',
    '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c',
    repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('6', 64), repeat('7', 64), repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);
end;
$$;

-- The rollback evidence table's own guard: nobody may insert directly, even
-- service_role, without the exact marker + payload hash the function sets.
-- (Run after the fixture so the import_id foreign key resolves -- what is
-- being proven here is the guard trigger, not the foreign key.)
do $$
begin
  begin
    insert into public.content_import_oral_check_objections_rollback_records (
      import_id, forward_database_payload_sha256, removed_catalog_sha256,
      restored_catalog_sha256, role_play_removed_count, removed_block_ids, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64), repeat('3', 64),
      2, array[
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      ]::uuid[],
      '{}'::jsonb
    );
    raise exception 'a direct unmarked insert into the rollback evidence table was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;
end;
$$;

-- The rollback evidence table's exact-count check constraints: scoped to
-- exactly 2 removed blocks, never reusable for the pilot's 3 or the
-- expansion's 9.
do $$
begin
  alter table public.content_import_oral_check_objections_rollback_records
    disable trigger oral_check_objections_rollback_records_guard;
  begin
    insert into public.content_import_oral_check_objections_rollback_records (
      import_id, forward_database_payload_sha256, removed_catalog_sha256,
      restored_catalog_sha256, role_play_removed_count, removed_block_ids, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64), repeat('3', 64),
      3, array[
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c',
        '00000000-0000-5000-a000-000000000001'
      ]::uuid[],
      '{}'::jsonb
    );
    raise exception 'the rollback evidence table accepted role_play_removed_count = 3 (this table is scoped to exactly 2)';
  exception when sqlstate '23514' then
    null;
  end;
  begin
    insert into public.content_import_oral_check_objections_rollback_records (
      import_id, forward_database_payload_sha256, removed_catalog_sha256,
      restored_catalog_sha256, role_play_removed_count, removed_block_ids, evidence
    ) values (
      'bmh-employee-training-v1', repeat('1', 64), repeat('2', 64), repeat('3', 64),
      2, array['b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3']::uuid[],
      '{}'::jsonb
    );
    raise exception 'the rollback evidence table accepted a removed_block_ids array of length 1';
  exception when sqlstate '23514' then
    null;
  end;
  alter table public.content_import_oral_check_objections_rollback_records
    enable trigger oral_check_objections_rollback_records_guard;
end;
$$;

-- The genuine forward insertion this rollback will be rehearsed against.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_insert_oral_check_objections_role_play_blocks();
  if v_result ->> 'status' <> 'inserted' then
    raise exception 'fixture forward insertion did not succeed: %', v_result;
  end if;
end;
$$;

-- Guard: the payload of one of the 2 target rows no longer exactly matches
-- the forward operation's own recorded mutations (simulating a hand edit
-- after insertion) -- the rollback must refuse, not silently remove a row
-- whose live content no longer matches what was actually inserted.
savepoint before_payload_tamper;
do $$
begin
  update public.content_blocks
  set content = content || '{"height_px": 761}'::jsonb
  where id = 'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3';

  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran against a tampered target row payload';
  exception when sqlstate '40001' then
    if sqlerrm not like '%no longer exactly match the forward operation%' then raise; end if;
  end;

  if not exists (
    select 1 from public.content_blocks
    where id = 'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3'
  ) then
    raise exception 'the refused rollback removed a row despite refusing';
  end if;
  if exists (
    select 1 from public.content_import_oral_check_objections_rollback_records
  ) then
    raise exception 'the refused rollback left a rollback evidence row behind';
  end if;
end;
$$;
rollback to savepoint before_payload_tamper;

-- Guard: the live catalog no longer matches the forward operation's own
-- recorded post-insert (replacement_catalog_sha256) state -- simulating an
-- unrelated catalog change since the objections insertion. The rollback must
-- refuse rather than mechanically remove 2 rows out from under an unknown,
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
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran against a drifted catalog hash';
  exception when sqlstate '40001' then
    if sqlerrm not like '%no longer matches the forward operation%post-insert state%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused rollback changed the target row count';
  end if;
end;
$$;
rollback to savepoint before_catalog_drift;

-- Guard: real learner activity exists against one of the 2 target blocks
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
    '06606606-6066-4066-8066-066066066066',
    'authenticated', 'authenticated',
    'migration-066-rollback-learner@bmh.invalid',
    crypt('Migration066RollbackLearner!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 066 Rollback Learner"}'::jsonb, now(), now()
  );
  insert into public.role_play_results (
    user_id, block_id, scenario_id, attempt_id, score
  ) values (
    '06606606-6066-4066-8066-066066066066',
    'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
    'c3642915-deab-4b3d-9479-0fc71afee9e6',
    'attempt-066-rollback-rehearsal',
    88
  );

  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran despite real role_play_results learner activity';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused rollback changed the target row count despite learner activity';
  end if;
end;
$$;
rollback to savepoint before_role_play_result_activity;

-- Guard: real learner activity exists against one of the 2 target blocks
-- (user_block_progress) -- same refusal, different activity table.
savepoint before_user_block_progress_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '06606606-6066-4066-8066-066066066067',
    'authenticated', 'authenticated',
    'migration-066-rollback-progress@bmh.invalid',
    crypt('Migration066RollbackProgress!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 066 Rollback Progress"}'::jsonb, now(), now()
  );
  insert into public.user_block_progress (user_id, block_id) values (
    '06606606-6066-4066-8066-066066066067',
    'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
  );

  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran despite real user_block_progress learner activity';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused rollback changed the target row count despite progress activity';
  end if;
end;
$$;
rollback to savepoint before_user_block_progress_activity;

-- user_video_progress is ON DELETE CASCADE on content_blocks.id (silent
-- data loss if the guard did not catch it).
savepoint before_user_video_progress_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '06606606-6066-4066-8066-066066066068',
    'authenticated', 'authenticated',
    'migration-066-rollback-video-progress@bmh.invalid',
    crypt('Migration066RollbackVideoProgress!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 066 Rollback Video Progress"}'::jsonb, now(), now()
  );
  insert into public.user_video_progress (
    user_id, block_id, position_seconds, duration_seconds,
    watched_ranges, last_observed_position_seconds, asset_version
  ) values (
    '06606606-6066-4066-8066-066066066068',
    'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
    30, 90, '[[0,30]]'::jsonb, 30,
    'malformed-or-direct-write-test-asset-version'
  );

  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran despite real user_video_progress activity';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused rollback changed the target row count despite video-progress activity';
  end if;
  if not exists (
    select 1 from public.user_video_progress
    where user_id = '06606606-6066-4066-8066-066066066068'
      and block_id = 'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3'
  ) then
    raise exception 'the refused rollback silently removed the user_video_progress row it was supposed to refuse over';
  end if;
end;
$$;
rollback to savepoint before_user_video_progress_activity;

-- user_video_completion_history is ON DELETE RESTRICT on both user_id and
-- block_id -- if the rollback's own precondition check did not catch this
-- first, the later `delete from public.content_blocks` would hit an
-- uncontrolled foreign_key_violation (SQLSTATE 23503) instead of this
-- function's own clear, controlled refusal (SQLSTATE 40001). Assert the
-- controlled refusal happens, not the raw FK error.
savepoint before_user_video_completion_history_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '06606606-6066-4066-8066-066066066069',
    'authenticated', 'authenticated',
    'migration-066-rollback-video-completion@bmh.invalid',
    crypt('Migration066RollbackVideoCompletion!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 066 Rollback Video Completion"}'::jsonb, now(), now()
  );
  insert into public.user_video_completion_history (user_id, block_id, asset_version) values (
    '06606606-6066-4066-8066-066066066069',
    'da8b819a-401d-5a9e-a7d9-ad237d128f0c',
    'malformed-or-direct-write-test-asset-version'
  );

  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran despite real user_video_completion_history activity';
  exception
    when sqlstate '40001' then
      if sqlerrm not like '%real learner activity exist%' then raise; end if;
    when sqlstate '23503' then
      raise exception 'the rollback hit an uncontrolled foreign-key violation instead of its own controlled refusal -- the learner-activity guard did not catch user_video_completion_history activity first: %', sqlerrm;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused rollback changed the target row count despite video-completion-history activity';
  end if;
end;
$$;
rollback to savepoint before_user_video_completion_history_activity;

-- Guard: user_course_resume.last_block_id pointing at a target block -- the
-- fifth activity table in the check, and the only one keyed by a column
-- other than block_id.
savepoint before_user_course_resume_activity;
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    '06606606-6066-4066-8066-06606606606a',
    'authenticated', 'authenticated',
    'migration-066-rollback-resume@bmh.invalid',
    crypt('Migration066RollbackResume!Aa1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Migration 066 Rollback Resume"}'::jsonb, now(), now()
  );
  insert into public.user_course_resume (
    user_id, course_id, last_lesson_id, last_block_id
  ) values (
    '06606606-6066-4066-8066-06606606606a',
    'e743b27c-7e0d-5760-aa25-5dbd75656718',
    '25973272-2cfc-5357-ae82-18ed08db636b',
    'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3'
  );

  begin
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'the rollback ran despite a real user_course_resume pointer at a target block';
  exception when sqlstate '40001' then
    if sqlerrm not like '%real learner activity exist%' then raise; end if;
  end;

  if (select count(*) from public.content_blocks
      where id in (
        'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
        'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
      )) <> 2 then
    raise exception 'the refused rollback changed the target row count despite a resume pointer';
  end if;
end;
$$;
rollback to savepoint before_user_course_resume_activity;

-- The genuine end-to-end rollback: every guard above now passes for real
-- (untampered payload, undrifted catalog, zero learner activity), so this
-- reaches the actual DELETE, exact-restoration verification, and guarded
-- rollback-evidence write.
do $$
declare
  v_result jsonb;
begin
  v_result := public.fn_rollback_oral_check_objections_role_play_blocks();
  if v_result ->> 'status' <> 'rolled_back' then
    raise exception 'expected status=rolled_back, got %', v_result;
  end if;
  if v_result ->> 'import_id' <> 'bmh-employee-training-v1' then
    raise exception 'unexpected import_id in rollback result: %', v_result;
  end if;
  if (v_result ->> 'role_play_removed_count')::integer <> 2 then
    raise exception 'expected role_play_removed_count=2, got %', v_result;
  end if;
  if v_result ->> 'removed_catalog_sha256' <> repeat('f', 64) then
    raise exception 'unexpected removed_catalog_sha256 in rollback result: %', v_result;
  end if;
  -- This is the load-bearing assertion: the catalog hash is restored to the
  -- EXACT prior (pre-insert) value the forward operation itself recorded and
  -- validated against production before it ever ran.
  if v_result ->> 'restored_catalog_sha256' <> '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95' then
    raise exception 'restored_catalog_sha256 does not match the exact pre-insert production value: %', v_result;
  end if;
end;
$$;

-- Both rows are gone, nothing else was touched.
do $$
begin
  if exists (
    select 1 from public.content_blocks
    where id in (
      'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
      'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
    )
  ) then
    raise exception 'a target row survived the real rollback';
  end if;
  if (select count(*) from public.lessons where content_import_id = 'bmh-employee-training-v1') <> 2 then
    raise exception 'the rollback touched lessons outside its own 2 target rows';
  end if;
end;
$$;

-- The session markers the rollback set are cleared again on the way out,
-- including the shared bmh.rollback_import_id delete marker -- a successful
-- rollback must not leave a live delete capability behind in the caller's
-- session.
do $$
begin
  if coalesce(current_setting('bmh.rollback_import_id', true), '') <> '' then
    raise exception 'the successful rollback left the shared bmh.rollback_import_id delete marker set in the session';
  end if;
  if coalesce(current_setting('bmh.oral_check_objections_rollback_import_id', true), '') <> ''
    or coalesce(current_setting('bmh.oral_check_objections_rollback_payload_sha256', true), '') <> ''
  then
    raise exception 'the successful rollback left its evidence-guard markers set in the session';
  end if;
end;
$$;

-- The forward evidence row is untouched -- it remains permanent historical
-- proof the insertion happened; the rollback never overwrites or deletes it.
do $$
begin
  if (select count(*) from public.content_import_oral_check_objections_role_play_records
      where import_id = 'bmh-employee-training-v1') <> 1 then
    raise exception 'the rollback altered the forward evidence row count';
  end if;
end;
$$;

-- The rollback evidence row: exact hashes, removed block ids, and evidence.
do $$
declare
  v_receipt public.content_import_oral_check_objections_rollback_records%rowtype;
begin
  select * into v_receipt
  from public.content_import_oral_check_objections_rollback_records
  where import_id = 'bmh-employee-training-v1';
  if not found then
    raise exception 'no rollback evidence row was written for the successful rollback';
  end if;
  if v_receipt.forward_database_payload_sha256 <> '372f0adb621b7860d3c42b5ccb2a3cbcc2c3697babcda990e017d8e6a052b016' then
    raise exception 'rollback evidence forward_database_payload_sha256 mismatch: %', v_receipt.forward_database_payload_sha256;
  end if;
  if v_receipt.removed_catalog_sha256 <> repeat('f', 64) then
    raise exception 'rollback evidence removed_catalog_sha256 mismatch: %', v_receipt.removed_catalog_sha256;
  end if;
  if v_receipt.restored_catalog_sha256 <> '5fae661261746ce1edfae2e1a425f8826a7a29a29d0f4be0a38bcd2a18c08d95' then
    raise exception 'rollback evidence restored_catalog_sha256 mismatch: %', v_receipt.restored_catalog_sha256;
  end if;
  if v_receipt.role_play_removed_count <> 2 then
    raise exception 'rollback evidence role_play_removed_count mismatch: %', v_receipt.role_play_removed_count;
  end if;
  if v_receipt.removed_block_ids <> array[
    'b3f7c70f-8a34-5a2b-ab09-de5f9da6c9a3',
    'da8b819a-401d-5a9e-a7d9-ad237d128f0c'
  ]::uuid[] then
    raise exception 'rollback evidence removed_block_ids mismatch: %', v_receipt.removed_block_ids;
  end if;
  if v_receipt.evidence -> 'lesson_source_keys' <> jsonb_build_array(
    'lesson-content-slot-09', 'lesson-content-slot-10'
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
    perform public.fn_rollback_oral_check_objections_role_play_blocks();
    raise exception 'a second rollback invocation after a real successful rollback was not refused';
  exception when sqlstate '40001' then
    if sqlerrm not like '%this one-shot rollback has already been performed%' then raise; end if;
  end;
  if (select count(*) from public.content_import_oral_check_objections_rollback_records
      where import_id = 'bmh-employee-training-v1') <> 1 then
    raise exception 'the refused second rollback changed the rollback evidence count';
  end if;
end;
$$;

-- And the forward insertion is STILL permanently refused after a rollback:
-- the forward evidence row is never removed, so the one-shot forward
-- refusal outlives the undo. Re-applying is a deliberate new migration, not
-- a re-invocation of this one.
do $$
begin
  begin
    perform public.fn_insert_oral_check_objections_role_play_blocks();
    raise exception 'the forward insertion became callable again after a successful rollback';
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
    raise exception 'the refused post-rollback forward invocation re-created the target rows';
  end if;
end;
$$;

rollback to savepoint oral_check_objections_rollback_rehearsal;

rollback;
