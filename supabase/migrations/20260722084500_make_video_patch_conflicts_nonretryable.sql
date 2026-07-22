-- Return compare-and-swap mismatches as a non-retryable HTTP conflict.

create or replace function public.fn_patch_imported_video_content(
  p_import_id text,
  p_patches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patch_count integer;
  v_storage_prefix text;
  v_updated_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Imported video content patch requires the service role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}-v[0-9]+$' then
    raise exception 'Imported video content patch refused: invalid versioned import_id.'
      using errcode = '22023';
  end if;
  if p_patches is null or jsonb_typeof(p_patches) <> 'array' then
    raise exception 'Imported video content patch refused: patches must be an array.'
      using errcode = '22023';
  end if;

  v_patch_count := jsonb_array_length(p_patches);
  if v_patch_count < 1 or v_patch_count > 100 then
    raise exception 'Imported video content patch refused: patches must contain 1 to 100 rows.'
      using errcode = '22023';
  end if;
  v_storage_prefix := 'courses/' || regexp_replace(p_import_id, '-v([0-9]+)$', '/v\1');

  if exists (
    select 1
    from jsonb_array_elements(p_patches) patch(value)
    where jsonb_typeof(patch.value) <> 'object'
      or (select count(*) from jsonb_object_keys(patch.value)) <> 3
      or not (patch.value ?& array['block_id', 'expected_content', 'replacement_content'])
      or jsonb_typeof(patch.value -> 'block_id') <> 'string'
      or patch.value ->> 'block_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(patch.value -> 'expected_content') <> 'object'
      or jsonb_typeof(patch.value -> 'replacement_content') <> 'object'
      or jsonb_typeof(patch.value -> 'replacement_content' -> 'file_path') <> 'string'
      or jsonb_typeof(patch.value -> 'replacement_content' -> 'caption_path') <> 'string'
      or patch.value -> 'replacement_content' ? 'transcript_path'
      or ((patch.value -> 'expected_content') - 'file_path' - 'caption_path' - 'transcript_path')
        is distinct from
        ((patch.value -> 'replacement_content') - 'file_path' - 'caption_path' - 'transcript_path')
      or not starts_with(
        patch.value -> 'replacement_content' ->> 'file_path',
        v_storage_prefix || '/videos/'
      )
      or patch.value -> 'replacement_content' ->> 'file_path'
        !~ '\.[0-9a-f]{64}\.mp4$'
      or not starts_with(
        patch.value -> 'replacement_content' ->> 'caption_path',
        v_storage_prefix || '/captions/'
      )
      or patch.value -> 'replacement_content' ->> 'caption_path'
        !~ '\.[0-9a-f]{64}\.vtt$'
  ) then
    raise exception 'Imported video content patch refused: malformed, over-broad, or noncanonical patch.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct patch.value ->> 'block_id')
    from jsonb_array_elements(p_patches) patch(value)
  ) <> v_patch_count then
    raise exception 'Imported video content patch refused: block IDs must be unique.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));

  if exists (
    select 1 from public.content_import_release_records release
    where release.import_id = p_import_id
  ) or exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and program.is_published
  ) or exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and course.is_published
  ) then
    raise exception 'Imported video content patch refused: released or published imports are immutable.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_patches) patch(value)
    where not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'content'
        and object.name = patch.value -> 'replacement_content' ->> 'file_path'
    ) or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'content'
        and object.name = patch.value -> 'replacement_content' ->> 'caption_path'
    )
  ) then
    raise exception 'Imported video content patch refused: replacement media object is missing.'
      using errcode = '22023';
  end if;

  with patches as (
    select
      (patch.value ->> 'block_id')::uuid as block_id,
      patch.value -> 'expected_content' as expected_content,
      patch.value -> 'replacement_content' as replacement_content
    from jsonb_array_elements(p_patches) patch(value)
  )
  update public.content_blocks block
  set content = patches.replacement_content
  from patches, public.lessons lesson, public.modules module, public.courses course
  where block.id = patches.block_id
    and block.content = patches.expected_content
    and block.block_type = 'video'
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_patch_count then
    raise exception 'Imported video content patch refused: target, ownership, type, or expected content mismatch.'
      using errcode = 'PT409';
  end if;

  return jsonb_build_object(
    'status', 'patched',
    'import_id', p_import_id,
    'patch_count', v_updated_count
  );
end;
$$;

revoke all on function public.fn_patch_imported_video_content(text, jsonb)
from public, anon, authenticated;
grant execute on function public.fn_patch_imported_video_content(text, jsonb)
to service_role;

