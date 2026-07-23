begin;

set local lock_timeout = '10s';
select set_config('request.jwt.claim.role', 'service_role', true);

select set_config('bmh.apply_import_id', 'migration-053-caption-v1', true);
insert into public.programs (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '05300000-0000-5000-a000-000000000001',
  'Migration 053 caption program',
  'migration-053-caption-v1',
  false,
  true
);
insert into public.courses (
  id, title, content_import_id, is_published, certificate_enabled
) values (
  '05300000-0000-5000-a000-000000000002',
  'Migration 053 caption course',
  'migration-053-caption-v1',
  false,
  false
);
insert into public.modules (id, course_id, title, sort_order) values (
  '05300000-0000-5000-a000-000000000003',
  '05300000-0000-5000-a000-000000000002',
  'Migration 053 caption module',
  1
);
insert into public.lessons (
  id, module_id, title, lesson_type, sort_order, content_import_id
) values (
  '05300000-0000-5000-a000-000000000004',
  '05300000-0000-5000-a000-000000000003',
  'Migration 053 caption lesson',
  'content',
  1,
  'migration-053-caption-v1'
);
insert into public.content_blocks (
  id, lesson_id, block_type, content, sort_order
) values (
  '05300000-0000-5000-a000-000000000005',
  '05300000-0000-5000-a000-000000000004',
  'video',
  jsonb_build_object(
    'file_path', 'courses/migration-053-caption/v1/videos/video-slot-01-test.mp4',
    'caption_path', 'courses/migration-053-caption/v1/captions/video-slot-01-test.' || repeat('a', 64) || '.vtt',
    'poster_path', 'courses/migration-053-caption/v1/posters/video-slot-01-test.webp',
    'duration_seconds', 60
  ),
  1
);
select set_config('bmh.apply_import_id', '', true);

select set_config('bmh.release_import_id', 'migration-053-caption-v1', true);
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
  'migration-053-caption-v1',
  '05300000-0000-5000-a000-000000000001',
  '05300000-0000-5000-a000-000000000006',
  '05300000-0000-5000-a000-000000000007',
  repeat('1', 64),
  repeat('2', 64),
  public.fn_course_import_catalog_sha256('migration-053-caption-v1'),
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
where content_import_id = 'migration-053-caption-v1';
update public.courses
set is_published = true
where content_import_id = 'migration-053-caption-v1';
select set_config('bmh.release_import_id', '', true);

insert into storage.objects (bucket_id, name, metadata, user_metadata) values
  (
    'content',
    'courses/migration-053-caption/v1/captions/video-slot-01-test.' || repeat('a', 64) || '.vtt',
    jsonb_build_object('size', 123, 'mimetype', 'text/vtt; charset=utf-8'),
    jsonb_build_object('sha256', repeat('a', 64), 'courseImportId', 'migration-053-caption-v1')
  ),
  (
    'content',
    'courses/migration-053-caption/v1/captions/video-slot-01-test.' || repeat('b', 64) || '.vtt',
    jsonb_build_object('size', 127, 'mimetype', 'text/vtt'),
    jsonb_build_object('sha256', repeat('b', 64), 'courseImportId', 'migration-053-caption-v1')
  );

do $$
declare
  v_expected_content jsonb;
  v_payload jsonb;
  v_catalog_sha256 text;
  v_result jsonb;
  v_after jsonb;
begin
  select content into v_expected_content
  from public.content_blocks
  where id = '05300000-0000-5000-a000-000000000005';

  v_payload := jsonb_build_array(jsonb_build_object(
    'block_id', '05300000-0000-5000-a000-000000000005',
    'caption_asset_key', 'caption-video-slot-01-test',
    'expected_content', v_expected_content,
    'expected_caption_path', v_expected_content ->> 'caption_path',
    'expected_caption_sha256', repeat('a', 64),
    'expected_size_bytes', 123,
    'replacement_caption_path', 'courses/migration-053-caption/v1/captions/video-slot-01-test.' || repeat('b', 64) || '.vtt',
    'replacement_caption_sha256', repeat('b', 64),
    'replacement_size_bytes', 127
  ));
  v_catalog_sha256 := public.fn_course_import_catalog_sha256(
    'migration-053-caption-v1'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform public.fn_replace_released_imported_video_captions(
      'migration-053-caption-v1',
      v_payload,
      repeat('c', 64),
      repeat('d', 64),
      v_catalog_sha256
    );
    raise exception 'authenticated caller replaced released captions';
  exception when sqlstate '42501' then
    if sqlerrm not like '%requires service_role%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.role', 'service_role', true);

  begin
    perform public.fn_replace_released_imported_video_captions(
      'migration-053-caption-v1',
      v_payload,
      repeat('c', 64),
      repeat('d', 64),
      repeat('0', 64)
    );
    raise exception 'stale catalog preflight replaced released captions';
  exception when sqlstate '40001' then
    if sqlerrm not like '%catalog drifted from the exact production preflight%' then raise; end if;
  end;

  v_result := public.fn_replace_released_imported_video_captions(
    'migration-053-caption-v1',
    v_payload,
    repeat('c', 64),
    repeat('d', 64),
    v_catalog_sha256
  );
  if v_result ->> 'status' <> 'replaced' then
    raise exception 'caption replacement did not complete: %', v_result;
  end if;

  select content into v_after
  from public.content_blocks
  where id = '05300000-0000-5000-a000-000000000005';
  if v_after <> jsonb_set(
    v_expected_content,
    '{caption_path}',
    to_jsonb('courses/migration-053-caption/v1/captions/video-slot-01-test.' || repeat('b', 64) || '.vtt'),
    false
  ) then
    raise exception 'caption replacement changed fields beyond caption_path: %', v_after;
  end if;
  if (select count(*) from public.content_import_video_caption_replacement_records
      where import_id = 'migration-053-caption-v1') <> 1 then
    raise exception 'caption replacement did not append one audit record';
  end if;

  v_result := public.fn_replace_released_imported_video_captions(
    'migration-053-caption-v1',
    v_payload,
    repeat('c', 64),
    repeat('d', 64),
    public.fn_course_import_catalog_sha256('migration-053-caption-v1')
  );
  if v_result ->> 'status' <> 'already_replaced' then
    raise exception 'caption replacement replay was not idempotent: %', v_result;
  end if;
  if (select count(*) from public.content_import_video_caption_replacement_records
      where import_id = 'migration-053-caption-v1') <> 1 then
    raise exception 'caption replacement replay duplicated its audit record';
  end if;

  begin
    update public.content_import_video_caption_replacement_records
    set replacements = '[]'::jsonb
    where import_id = 'migration-053-caption-v1';
    raise exception 'caption replacement audit record was mutable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%immutable and operation-bound%' then raise; end if;
  end;
end;
$$;

rollback;
