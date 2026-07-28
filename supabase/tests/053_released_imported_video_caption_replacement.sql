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

-- The released caption replacement RPC is RETIRED by 20260727180000 (phase 1
-- of the versioned-ledger cutover): released-catalog corrections must go
-- through the shared ledger (fn_revise_released_content_blocks_v2), and its
-- already-applied history is absorbed as validated lineage rows by the
-- phase-2 backfill. This test now proves the retirement is total: even a
-- perfectly-formed call against a real released fixture fails closed, the
-- receipt table is sealed against ALL writes (a resumed in-flight old-body
-- call included), and the same holds for the released POSTER replacement
-- RPC retired alongside it. The canary poster path
-- (fn_replace_unreleased_imported_video_posters) is deliberately NOT
-- retired -- it hard-requires an unreleased, unpublished import and cannot
-- move a released catalog -- so it must remain callable.
do $$
declare
  v_expected_content jsonb;
  v_payload jsonb;
  v_catalog_sha256 text;
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

  -- A well-formed call -- real import, real block, live catalog checksum --
  -- must fail closed on the retirement, never reach any validation.
  begin
    perform public.fn_replace_released_imported_video_captions(
      'migration-053-caption-v1',
      v_payload,
      repeat('c', 64),
      repeat('d', 64),
      v_catalog_sha256
    );
    raise exception 'the retired released caption replacement RPC was callable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%retired%' then raise; end if;
  end;

  -- Same for the released poster replacement RPC.
  begin
    perform public.fn_replace_released_imported_video_posters(
      'migration-053-caption-v1',
      '[]'::jsonb,
      repeat('c', 64),
      repeat('d', 64),
      v_catalog_sha256,
      repeat('e', 64)
    );
    raise exception 'the retired released poster replacement RPC was callable';
  exception when sqlstate '42501' then
    if sqlerrm not like '%retired%' then raise; end if;
  end;

  -- The receipt tables are sealed against every write path, including a
  -- resumed in-flight OLD-BODY call that already holds the exact historical
  -- marker pair its guard used to accept.
  perform set_config('bmh.replace_video_captions_import_id', 'migration-053-caption-v1', true);
  perform set_config('bmh.replace_video_captions_payload_sha256', repeat('f', 64), true);
  begin
    insert into public.content_import_video_caption_replacement_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, client_payload_sha256,
      approval_evidence_sha256, replacement_count, replacements
    ) values (
      'migration-053-caption-v1', v_catalog_sha256, repeat('1', 64),
      repeat('f', 64), repeat('c', 64),
      repeat('d', 64), 1, v_payload
    );
    raise exception 'the sealed caption receipt table accepted a marker-bearing insert';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;
  perform set_config('bmh.replace_video_captions_import_id', '', true);
  perform set_config('bmh.replace_video_captions_payload_sha256', '', true);

  perform set_config('bmh.replace_video_posters_import_id', 'migration-053-caption-v1', true);
  perform set_config('bmh.replace_video_posters_payload_sha256', repeat('f', 64), true);
  begin
    insert into public.content_import_video_poster_replacement_records (
      import_id, prior_catalog_sha256, replacement_catalog_sha256,
      database_payload_sha256, client_payload_sha256,
      approval_evidence_sha256, preflight_evidence_sha256,
      replacement_count, replacements
    ) values (
      'migration-053-caption-v1', v_catalog_sha256, repeat('1', 64),
      repeat('f', 64), repeat('c', 64),
      repeat('d', 64), repeat('e', 64), 1, '[{"fixture":true}]'::jsonb
    );
    raise exception 'the sealed poster receipt table accepted a marker-bearing insert';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;
  perform set_config('bmh.replace_video_posters_import_id', '', true);
  perform set_config('bmh.replace_video_posters_payload_sha256', '', true);

  -- Sealed means UPDATE and DELETE too (append-only history stays intact
  -- for the ledger backfill to mirror). Seed one historical receipt with
  -- the guard disabled -- modeling a row that existed before the seal --
  -- then prove it is immutable. Real hashes: the seeded receipt must chain
  -- release-publication -> live for the ledger backfill that runs against
  -- this table (this test's import never mutated content after publish, so
  -- prior = the release record's pre-publish capture bridged by the
  -- publication baseline... which requires a real catalog CHANGE; use the
  -- live catalog with a real caption-path mutation instead).
  update public.content_blocks
  set content = jsonb_set(content, '{caption_path}',
    to_jsonb('courses/migration-053-caption/v1/captions/video-slot-01-test.' || repeat('b', 64) || '.vtt'), false)
  where id = '05300000-0000-5000-a000-000000000005';
  alter table public.content_import_video_caption_replacement_records
    disable trigger content_import_video_caption_replacement_records_guard;
  insert into public.content_import_video_caption_replacement_records (
    import_id, prior_catalog_sha256, replacement_catalog_sha256,
    database_payload_sha256, client_payload_sha256,
    approval_evidence_sha256, replacement_count, replacements
  ) values (
    'migration-053-caption-v1', v_catalog_sha256,
    public.fn_course_import_catalog_sha256('migration-053-caption-v1'),
    repeat('f', 64), repeat('c', 64),
    repeat('d', 64), 1, v_payload
  );
  alter table public.content_import_video_caption_replacement_records
    enable trigger content_import_video_caption_replacement_records_guard;
  begin
    update public.content_import_video_caption_replacement_records
    set replacements = '[]'::jsonb
    where import_id = 'migration-053-caption-v1';
    raise exception 'the sealed caption receipt table accepted an update';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;
  begin
    delete from public.content_import_video_caption_replacement_records
    where import_id = 'migration-053-caption-v1';
    raise exception 'the sealed caption receipt table accepted a delete';
  exception when sqlstate '42501' then
    if sqlerrm not like '%sealed read-only history%' then raise; end if;
  end;

  -- The canary path stays alive: it must still refuse for its own reasons
  -- (this import is not the canary, errcode 22023), NOT with a retirement
  -- error (42501).
  begin
    perform public.fn_replace_unreleased_imported_video_posters(
      'migration-053-caption-v1',
      '[]'::jsonb,
      repeat('c', 64)
    );
    raise exception 'the canary poster RPC accepted a non-canary import';
  exception when sqlstate '22023' then
    if sqlerrm not like '%restricted to the exact Tech Stack canary%' then raise; end if;
  when sqlstate '42501' then
    raise exception 'the canary poster RPC was wrongly retired: %', sqlerrm;
  end;
end;
$$;

rollback;
