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
      'da982c09-ab41-5c23-9c77-0d455bc80fa0',
      '60aafd07-5c22-5eed-b2ce-755cf26af8cc',
      '7101c788-8bbe-5a66-a56e-ff1536d22457'
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
      'da982c09-ab41-5c23-9c77-0d455bc80fa0',
      '60aafd07-5c22-5eed-b2ce-755cf26af8cc',
      '7101c788-8bbe-5a66-a56e-ff1536d22457'
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

rollback;
