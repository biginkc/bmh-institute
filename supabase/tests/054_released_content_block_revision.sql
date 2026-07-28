begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if to_regprocedure(
    'public.fn_revise_released_content_blocks_v1(text,text,text,text,jsonb,text,jsonb,text)'
  ) is null then
    raise exception 'released content block revision function is absent';
  end if;
  if to_regclass(
    'public.content_import_released_content_block_revision_records'
  ) is null then
    raise exception 'released content block revision audit table is absent';
  end if;
end;
$$;

-- Migration 20260727180000 retired the v1 one-shot RPC (its exact 44-block
-- payload was already consumed and is mirrored into the shared
-- content_import_release_revisions ledger). Every call -- including the
-- original refusal-branch inputs this file used to exercise individually --
-- now fails closed with the retirement error before any other validation.
do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    perform public.fn_revise_released_content_blocks_v1(
      'bmh-employee-training-v1',
      '440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d',
      '585b72c923a560d2228f6149a5b906ec02958f19d62818dc5c109c3968345a33',
      'e66250effa99bda93e8dd828077811585a5369e2e142bfa9bc5381f5ccd94eb4',
      '[]'::jsonb,
      '81d918fd621bb82da935a81f06a08196ce27b2cb853fafcf0f8a2df88de8201b',
      '{}'::jsonb,
      'invalid'
    );
    raise exception 'the retired v1 released content revision RPC was callable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%retired%' then raise; end if;
  end;

  if exists (
    select 1
    from information_schema.routine_privileges privilege
    where privilege.routine_schema = 'public'
      and privilege.routine_name = 'fn_revise_released_content_blocks_v1'
      and privilege.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ) then
    raise exception 'the retired v1 RPC still carries execute grants';
  end if;
end;
$$;

select set_config('bmh.apply_import_id', 'bmh-employee-training-v1', true);
insert into public.programs (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '05400000-0000-5000-a000-000000000011',
  'Migration 054 content revision program',
  'bmh-employee-training-v1',
  false,
  true
);
insert into public.courses (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '05400000-0000-5000-a000-000000000012',
  'Migration 054 content revision course',
  'bmh-employee-training-v1',
  false,
  false
);
insert into public.program_courses (
  id, program_id, course_id, sort_order
) values (
  '05400000-0000-5000-a000-000000000013',
  '05400000-0000-5000-a000-000000000011',
  '05400000-0000-5000-a000-000000000012',
  1
);
insert into public.modules (id, course_id, title, sort_order) values (
  '05400000-0000-5000-a000-000000000014',
  '05400000-0000-5000-a000-000000000012',
  'Migration 054 content revision module',
  1
);
insert into public.lessons (
  id, module_id, title, lesson_type, sort_order, content_import_id
) values (
  '05400000-0000-5000-a000-000000000015',
  '05400000-0000-5000-a000-000000000014',
  'Migration 054 content revision lesson',
  'content',
  1,
  'bmh-employee-training-v1'
);
select set_config('bmh.apply_import_id', '', true);

select set_config('bmh.release_import_id', 'bmh-employee-training-v1', true);
insert into public.content_import_release_records (
  import_id,
  program_id,
  qa_role_group_id,
  employee_role_group_id,
  manifest_sha256,
  reconciliation_sha256,
  catalog_sha256,
  rollback_rehearsal_sha256,
  chrome_desktop_sha256,
  chrome_mobile_sha256,
  admin_happy_path_sha256,
  approval_sha256,
  approved_by,
  evidence
) values (
  'bmh-employee-training-v1',
  '05400000-0000-5000-a000-000000000011',
  '05400000-0000-5000-a000-000000000016',
  '05400000-0000-5000-a000-000000000017',
  '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c',
  repeat('2', 64),
  public.fn_course_import_catalog_sha256('bmh-employee-training-v1'),
  repeat('4', 64),
  repeat('5', 64),
  repeat('6', 64),
  repeat('7', 64),
  repeat('8', 64),
  'Jarrad Henry',
  '{}'::jsonb
);
update public.programs
set is_published = true
where content_import_id = 'bmh-employee-training-v1';
update public.courses
set is_published = true
where content_import_id = 'bmh-employee-training-v1';
select set_config('bmh.release_import_id', '', true);

-- The v1 marker branch is REMOVED from the content_blocks insert guard and
-- the v1 receipt table is sealed. This doubles as the resumed-in-flight-v1
-- concurrency regression: a v1 call that resolved the OLD function body
-- before the cutover migration sets exactly these session markers itself
-- before writing -- so proving that marker-bearing writes fail closed proves
-- the resumed call's writes fail closed, no matter when it resumes.
do $$
begin
  perform set_config('bmh.revise_content_blocks_import_id', 'bmh-employee-training-v1', true);
  perform set_config(
    'bmh.revise_content_blocks_payload_sha256',
    '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a',
    true
  );
  -- Even the EXACT historical marker pair (the one-shot payload hash the old
  -- guard admitted) no longer opens the content_blocks insert path.
  begin
    insert into public.content_blocks (
      id, lesson_id, block_type, content, sort_order, is_required_for_completion
    ) values (
      '05400000-0000-5000-a000-000000000018',
      '05400000-0000-5000-a000-000000000015',
      'role_play',
      '{"scenario_id":"05400000-0000-5000-a000-000000000019","title":"Exact marker"}'::jsonb,
      1,
      true
    );
    raise exception 'the retired v1 marker branch still admitted a content block insert';
  exception when sqlstate '42501' then
    if sqlerrm not like '%exact apply or released content revision operation%' then
      raise;
    end if;
  end;

  -- And the v1 receipt table refuses marker-bearing inserts outright: the
  -- resumed call could not write its legacy receipt either.
  begin
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
      'bmh-employee-training-v1',
      repeat('1', 64),
      repeat('2', 64),
      repeat('3', 64),
      repeat('4', 64),
      repeat('5', 64),
      '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a',
      repeat('8', 64),
      19,
      19,
      6,
      (
        select jsonb_agg(jsonb_build_object('fixture', item))
        from generate_series(1, 44) item
      ),
      '{}'::jsonb
    );
    raise exception 'the sealed v1 receipt table accepted a marker-bearing insert';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;
  perform set_config('bmh.revise_content_blocks_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_payload_sha256', '', true);
end;
$$;

-- The sealed guard refuses every write to the v1 receipt table -- updates
-- and deletes exactly as before (immutability), and now inserts too. Seed a
-- historical receipt with the guard disabled (row-level triggers do not fire
-- on zero-row statements), exactly modeling a real pre-cutover receipt.
alter table public.content_import_released_content_block_revision_records
  disable trigger content_import_released_content_block_revision_records_guard;
insert into public.content_import_released_content_block_revision_records (
  import_id, original_release_manifest_sha256, expected_active_manifest_sha256,
  manifest_sha256, prior_catalog_sha256, replacement_catalog_sha256,
  database_payload_sha256, client_payload_sha256,
  guide_update_count, flashcard_update_count, role_play_insert_count,
  mutations, evidence
) values (
  'bmh-employee-training-v1',
  repeat('1', 64), repeat('2', 64), repeat('3', 64),
  repeat('4', 64), repeat('5', 64), repeat('9', 64), repeat('8', 64),
  19, 19, 6,
  (
    select jsonb_agg(jsonb_build_object('fixture', item))
    from generate_series(1, 44) item
  ),
  '{}'::jsonb
);
alter table public.content_import_released_content_block_revision_records
  enable trigger content_import_released_content_block_revision_records_guard;

do $$
begin
  begin
    update public.content_import_released_content_block_revision_records
    set evidence = '{"changed":true}'::jsonb
    where import_id = 'bmh-employee-training-v1';
    raise exception 'released content block revision audit was mutable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;

  begin
    delete from public.content_import_released_content_block_revision_records
    where import_id = 'bmh-employee-training-v1';
    raise exception 'released content block revision audit was deletable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;
end;
$$;

rollback;
