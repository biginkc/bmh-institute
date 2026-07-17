begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if not exists (
    select 1
    from private.fixture_cleanup_tables_v1
    where table_name = 'sandra_course_completion_deliveries'
      and identity_fields = array['id']::text[]
      and expected_count = 0
  ) or not exists (
    select 1
    from private.fixture_cleanup_tables_v1
    where table_name = 'user_video_completion_history'
      and identity_fields = array['user_id', 'block_id', 'asset_version']::text[]
      and expected_count = 0
  ) then
    raise exception 'final fixture cleanup dependency tables are not registered';
  end if;

  if not exists (
    select 1
    from private.fixture_cleanup_references_v1
    where child_table = 'sandra_course_completion_deliveries'
      and child_field = 'course_id'
      and parent_table = 'courses'
      and match_type = 'scalar'
  ) or not exists (
    select 1
    from private.fixture_cleanup_references_v1
    where child_table = 'user_video_completion_history'
      and child_field = 'block_id'
      and parent_table = 'content_blocks'
      and match_type = 'scalar'
  ) then
    raise exception 'final fixture cleanup dependency references are not registered';
  end if;
end;
$$;

-- Exercise the public wrapper through a complete successful release and its
-- idempotent replay. Everything lives in this transaction and is removed by
-- the final rollback, including the otherwise immutable release record.
insert into public.role_groups (id, name) values
  ('03410000-0000-5000-a000-000000000005', 'Migration 034 wrapper QA'),
  ('03410000-0000-5000-a000-000000000006', 'Migration 034 wrapper employees');

select set_config('bmh.apply_import_id', 'migration-034-wrapper', true);
insert into public.programs (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '03410000-0000-5000-a000-000000000001',
  'Migration 034 wrapper program',
  'migration-034-wrapper',
  false,
  true
);
insert into public.courses (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '03410000-0000-5000-a000-000000000002',
  'Migration 034 wrapper course',
  'migration-034-wrapper',
  false,
  false
);
insert into public.program_courses (id, program_id, course_id, sort_order) values (
  '03410000-0000-5000-a000-000000000007',
  '03410000-0000-5000-a000-000000000001',
  '03410000-0000-5000-a000-000000000002',
  1
);
insert into public.modules (id, course_id, title, sort_order) values (
  '03410000-0000-5000-a000-000000000003',
  '03410000-0000-5000-a000-000000000002',
  'Migration 034 wrapper module',
  1
);
insert into public.lessons (
  id, module_id, title, lesson_type, sort_order, content_import_id
) values (
  '03410000-0000-5000-a000-000000000004',
  '03410000-0000-5000-a000-000000000003',
  'Migration 034 wrapper lesson',
  'content',
  1,
  'migration-034-wrapper'
);
insert into public.program_access (id, program_id, role_group_id) values (
  '03410000-0000-5000-a000-000000000008',
  '03410000-0000-5000-a000-000000000001',
  '03410000-0000-5000-a000-000000000005'
);
select set_config('bmh.apply_import_id', '', true);

do $$
declare
  v_catalog_sha256 text;
  v_recorded_at text := (now() - interval '1 minute')::text;
  v_evidence jsonb;
  v_release jsonb;
  v_replay jsonb;
begin
  v_catalog_sha256 := public.fn_course_import_catalog_sha256(
    'migration-034-wrapper'
  );
  v_evidence := jsonb_build_object(
    'manifest', jsonb_build_object(
      'sha256', repeat('a', 64),
      'recorded_at', v_recorded_at,
      'status', 'finalized'
    ),
    'reconciliation', jsonb_build_object(
      'sha256', repeat('b', 64),
      'catalog_sha256', v_catalog_sha256,
      'recorded_at', v_recorded_at,
      'status', 'passed',
      'exact', true
    ),
    'rollback_rehearsal', jsonb_build_object(
      'sha256', repeat('c', 64),
      'recorded_at', v_recorded_at,
      'status', 'passed'
    ),
    'chrome_desktop', jsonb_build_object(
      'sha256', repeat('d', 64),
      'recorded_at', v_recorded_at,
      'status', 'passed'
    ),
    'chrome_mobile', jsonb_build_object(
      'sha256', repeat('e', 64),
      'recorded_at', v_recorded_at,
      'status', 'passed'
    ),
    'admin_happy_path', jsonb_build_object(
      'sha256', repeat('f', 64),
      'recorded_at', v_recorded_at,
      'status', 'passed'
    ),
    'jarrad_approval', jsonb_build_object(
      'sha256', repeat('0', 64),
      'approved_at', v_recorded_at,
      'status', 'approved',
      'approved_by', 'Jarrad Henry'
    )
  );

  v_release := public.fn_release_course_import_v1(
    'migration-034-wrapper',
    '03410000-0000-5000-a000-000000000001',
    '03410000-0000-5000-a000-000000000006',
    v_evidence,
    'RELEASE-BMH-INSTITUTE:migration-034-wrapper:' || repeat('a', 64)
  );
  if v_release ->> 'status' <> 'released'
    or v_release ->> 'catalog_sha256' <> v_catalog_sha256 then
    raise exception 'public release wrapper did not complete the valid release: %', v_release;
  end if;

  v_replay := public.fn_release_course_import_v1(
    'migration-034-wrapper',
    '03410000-0000-5000-a000-000000000001',
    '03410000-0000-5000-a000-000000000006',
    v_evidence,
    'RELEASE-BMH-INSTITUTE:migration-034-wrapper:' || repeat('a', 64)
  );
  if v_replay ->> 'status' <> 'already_released' then
    raise exception 'public release wrapper was not idempotent: %', v_replay;
  end if;

  if not exists (
    select 1 from public.content_import_release_records
    where import_id = 'migration-034-wrapper'
      and catalog_sha256 = v_catalog_sha256
  ) or not exists (
    select 1 from public.programs
    where id = '03410000-0000-5000-a000-000000000001'
      and is_published and certificate_enabled
  ) or not exists (
    select 1 from public.courses
    where id = '03410000-0000-5000-a000-000000000002'
      and is_published and not certificate_enabled
  ) or (
    select count(*) from public.program_access
    where program_id = '03410000-0000-5000-a000-000000000001'
  ) <> 2 then
    raise exception 'public release wrapper did not persist its exact release state';
  end if;
end;
$$;

select set_config('bmh.apply_import_id', 'migration-034-released', true);
insert into public.programs (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '7ef45711-fb32-5a5e-a28b-8c15ecef8422',
  'Migration 034 released program',
  'migration-034-released',
  false,
  true
);
insert into public.courses (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  'cdf20425-1732-585f-a71f-37341094c700',
  'Migration 034 released course',
  'migration-034-released',
  false,
  false
);
select set_config('bmh.apply_import_id', '', true);

select set_config('bmh.release_import_id', 'migration-034-released', true);
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
  'migration-034-released',
  '7ef45711-fb32-5a5e-a28b-8c15ecef8422',
  '03403403-4034-4034-8034-034034034034',
  '03403403-4034-4034-8034-034034034035',
  repeat('1', 64),
  repeat('2', 64),
  repeat('3', 64),
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
where content_import_id = 'migration-034-released';
update public.courses
set is_published = true
where content_import_id = 'migration-034-released';
select set_config('bmh.release_import_id', '', true);

do $$
begin
  begin
    perform public.fn_apply_course_import(
      'migration-034-released',
      '[]'::jsonb
    );
    raise exception 'released import apply was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%released imports are immutable%' then
      raise;
    end if;
  end;

  begin
    perform public.fn_rollback_course_import(
      'migration-034-released',
      jsonb_build_object(
        'content_blocks', '[]'::jsonb,
        'courses', jsonb_build_array(
          jsonb_build_object('id', 'cdf20425-1732-585f-a71f-37341094c700')
        )
      )
    );
    raise exception 'released import rollback was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%released imports are immutable%' then
      raise;
    end if;
  end;

  begin
    perform public.fn_rollback_course_import(
      'migration-034-released',
      '{}'::jsonb
    );
    raise exception 'released import malformed rollback was delegated';
  exception when sqlstate '42501' then
    if sqlerrm not like '%released imports are immutable%' then
      raise;
    end if;
  end;
end;
$$;

select set_config('bmh.apply_import_id', 'migration-034-published', true);
insert into public.programs (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '18dce43f-e21f-5656-a9b8-90ee35813609',
  'Migration 034 published program',
  'migration-034-published',
  false,
  true
);
insert into public.courses (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '646e0011-f1e7-56a4-aea1-d899573d9ee7',
  'Migration 034 published course',
  'migration-034-published',
  false,
  false
);
select set_config('bmh.apply_import_id', '', true);

-- Build the inconsistent state defensively guarded by migration 034 without
-- manufacturing an immutable release record in the shared test project. This
-- entire acceptance script is rolled back.
alter table public.programs disable trigger programs_guard_imported_publication;
alter table public.courses disable trigger courses_guard_imported_publication;
update public.programs
set is_published = true
where content_import_id = 'migration-034-published';
update public.courses
set is_published = true
where content_import_id = 'migration-034-published';
alter table public.programs enable trigger programs_guard_imported_publication;
alter table public.courses enable trigger courses_guard_imported_publication;

do $$
begin
  begin
    perform public.fn_apply_course_import(
      'migration-034-published',
      '[]'::jsonb
    );
    raise exception 'published import apply was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%published imports are immutable%' then
      raise;
    end if;
  end;

  begin
    perform public.fn_rollback_course_import(
      'migration-034-published',
      jsonb_build_object(
        'content_blocks', '[]'::jsonb,
        'courses', jsonb_build_array(
          jsonb_build_object('id', '646e0011-f1e7-56a4-aea1-d899573d9ee7')
        )
      )
    );
    raise exception 'published import rollback was accepted';
  exception when sqlstate '42501' then
    if sqlerrm not like '%published imports are immutable%' then
      raise;
    end if;
  end;
end;
$$;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.fn_apply_course_import(text, jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.fn_rollback_course_import(text, jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.fn_apply_course_import_v023_without_insert_guard(text, jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.fn_rollback_course_import_v019_without_video_history_guard(text, jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.fn_release_course_import_v027_without_global_mutation_lock(text, uuid, uuid, jsonb, text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.fn_apply_course_import(text, jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.fn_apply_course_import(text, jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.fn_rollback_course_import(text, jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.fn_rollback_course_import(text, jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.fn_release_course_import_v1(text, uuid, uuid, jsonb, text)',
    'EXECUTE'
  ) then
    raise exception 'import mutation wrappers/helpers have unsafe runtime privileges';
  end if;
end;
$$;

rollback;
