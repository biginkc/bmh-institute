begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

-- 20260728050000_apply_oral_check_pilot_role_play_blocks.sql has to satisfy
-- three separate requirements at once, and this file proves all three against
-- the REAL, unmodified migration file rather than a hand-copied approximation
-- of its logic:
--
--   (a) Round-6 review, finding 2 -- REPLAY SAFE. Applied to a genuinely
--       clean database (a local supabase db reset, a CI validation run, a
--       fresh preview or test project), it must skip cleanly and write
--       nothing, because there is no bmh-employee-training-v1 catalog there
--       to modify. The round-5 version raised unconditionally instead, which
--       broke every clean-database replay and was only masked by a hardcoded
--       skip in run-controller-gate-pr-harness.mjs.
--   (b) Round-5 review, finding 1 -- STILL FAILS CLOSED where it matters.
--       Applied to a database that DOES hold this catalog but has no release
--       record for it (an incomplete restore, a catalog reloaded after
--       replay, an import applied but never released), it must still raise
--       SQLSTATE 55000 rather than quietly reporting success while the pilot
--       never applied.
--   (c) It must still genuinely work against a correct, populated target.

do $$
begin
  if to_regprocedure('public.fn_insert_oral_check_pilot_role_play_blocks()') is null then
    raise exception '20260728020000 has not been applied -- this test must run after the full migration set, not standalone';
  end if;
  if to_regprocedure('public.fn_rollback_oral_check_pilot_role_play_blocks()') is null then
    raise exception '20260728030000 has not been applied -- this test must run after the full migration set, not standalone';
  end if;
end;
$$;

-- (a) Clean-database replay safety. This transaction genuinely holds neither
-- a release record nor any catalog row for this import, which is exactly the
-- state of a fresh database replaying the migration history.
do $$
begin
  if exists (
    select 1 from public.content_import_release_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'this test expects to start with no release record for bmh-employee-training-v1';
  end if;
  if exists (
    select 1 from public.programs where content_import_id = 'bmh-employee-training-v1'
    union all
    select 1 from public.courses where content_import_id = 'bmh-employee-training-v1'
    union all
    select 1 from public.lessons where content_import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'this test expects to start with no bmh-employee-training-v1 catalog rows';
  end if;
end;
$$;

savepoint before_clean_database_apply;

-- ON_ERROR_STOP stays ON here: raising at all is the failure this section
-- exists to catch.
\i supabase/migrations/20260728050000_apply_oral_check_pilot_role_play_blocks.sql

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
    raise exception 'the clean-database skip inserted content blocks -- it must write nothing at all';
  end if;
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'the clean-database skip wrote a forward evidence row -- it must write nothing at all';
  end if;
end;
$$;

rollback to savepoint before_clean_database_apply;

-- (b) Catalog present, release absent: the state that must still fail closed.
savepoint before_unreleased_catalog_apply;

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

  perform set_config('bmh.apply_import_id', '', true);
end;
$$;

\set ON_ERROR_STOP off
\i supabase/migrations/20260728050000_apply_oral_check_pilot_role_play_blocks.sql
\set ON_ERROR_STOP on

\set unreleased_sqlstate :LAST_ERROR_SQLSTATE
\set unreleased_message :LAST_ERROR_MESSAGE

rollback to savepoint before_unreleased_catalog_apply;

select set_config('bmh.test_059_unreleased_sqlstate', :'unreleased_sqlstate', true);
select set_config('bmh.test_059_unreleased_message', :'unreleased_message', true);

do $$
declare
  v_sqlstate text := current_setting('bmh.test_059_unreleased_sqlstate', true);
  v_message text := current_setting('bmh.test_059_unreleased_message', true);
begin
  if v_sqlstate is null or v_sqlstate = '' or v_sqlstate = '00000' then
    raise exception 'the apply migration silently succeeded against a database that holds this catalog with no release record -- it must fail closed instead';
  end if;
  if v_sqlstate <> '55000' then
    raise exception 'expected the apply migration to refuse with SQLSTATE 55000 on an unreleased catalog, got sqlstate=% message=%',
      v_sqlstate, v_message;
  end if;
  if position('release' in lower(v_message)) = 0 then
    raise exception 'the apply migration failed for an unexpected reason: %', v_message;
  end if;
  if exists (
    select 1 from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) then
    raise exception 'the refused apply left content blocks behind';
  end if;
  if exists (
    select 1 from public.content_import_oral_check_pilot_role_play_records
    where import_id = 'bmh-employee-training-v1'
  ) then
    raise exception 'the refused apply left a forward evidence row behind';
  end if;
end;
$$;

-- (c) Real success against a populated fixture: build the exact real
-- production program/course/module/lesson rows and release record 056/057/058
-- use, then \i the REAL apply file (not the function called directly) and
-- confirm it actually reaches a genuine successful insertion.
savepoint before_populated_success;

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
    '05900000-0000-5000-a000-000000000001', '05900000-0000-5000-a000-000000000002',
    '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c',
    repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
    repeat('6', 64), repeat('7', 64), repeat('8', 64), 'Jarrad Henry', '{}'::jsonb
  );
  update public.programs set is_published = true where content_import_id = 'bmh-employee-training-v1';
  update public.courses set is_published = true where content_import_id = 'bmh-employee-training-v1';
  perform set_config('bmh.release_import_id', '', true);
end;
$$;

-- The real, unmodified apply migration file -- not the function called
-- directly -- must now reach a genuine successful insertion.
\i supabase/migrations/20260728050000_apply_oral_check_pilot_role_play_blocks.sql

do $$
begin
  if (
    select count(*) from public.content_blocks
    where id in (
      '7300bba9-a9fc-582c-aa20-dd5d58754165',
      '4464ecdd-2650-59ed-a525-78871e846d20',
      '34758403-1ddd-5e3c-a054-b2f28310d8b8'
    )
  ) <> 3 then
    raise exception 'the real apply migration file did not insert the 3 oral-check blocks against a populated fixture';
  end if;
  if (
    select count(*) from public.content_import_oral_check_pilot_role_play_records
    where import_id = 'bmh-employee-training-v1'
  ) <> 1 then
    raise exception 'the real apply migration file did not record the forward evidence receipt';
  end if;
end;
$$;

rollback to savepoint before_populated_success;

rollback;
