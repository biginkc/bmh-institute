-- Replace approved lesson thumbnails without weakening immutable import ownership.
-- Every replacement is compare-and-swap guarded by the exact prior provenance,
-- requires the replacement object to exist, and runs as one serialized transaction.

create or replace function public.fn_guard_catalog_artwork_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.content_import_id is not null and (
      coalesce(auth.role(), '') <> 'service_role'
      or coalesce(current_setting('bmh.apply_import_id', true), '')
        <> new.content_import_id
    ) then
      raise exception 'Imported catalog provenance requires the exact course-import apply operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.content_import_id is null and new.content_import_id is not null then
    if coalesce(auth.role(), '') <> 'service_role'
      or coalesce(current_setting('bmh.apply_import_id', true), '')
        <> new.content_import_id
    then
      raise exception 'Imported catalog provenance requires the exact course-import apply operation.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.content_import_id is not null and (
    new.content_import_id is distinct from old.content_import_id
    or new.thumbnail_asset_key is distinct from old.thumbnail_asset_key
    or new.thumbnail_approved_path is distinct from old.thumbnail_approved_path
    or new.thumbnail_approved_sha256 is distinct from old.thumbnail_approved_sha256
    or new.thumbnail_path is distinct from old.thumbnail_path
  ) then
    if coalesce(auth.role(), '') = 'service_role'
      and new.content_import_id = old.content_import_id
      and coalesce(current_setting('bmh.replace_import_artwork_id', true), '')
        = old.content_import_id
    then
      return new;
    end if;
    raise exception 'imported catalog artwork provenance is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_catalog_artwork_provenance()
from public, anon, authenticated;

create or replace function public.fn_replace_imported_lesson_artwork(
  p_import_id text,
  p_replacements jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_lesson_id uuid;
  v_row public.lessons%rowtype;
  v_count integer := 0;
  v_required_keys constant text[] := array[
    'lesson_id',
    'expected_thumbnail_asset_key',
    'expected_thumbnail_approved_path',
    'expected_thumbnail_approved_sha256',
    'expected_thumbnail_path',
    'replacement_thumbnail_asset_key',
    'replacement_thumbnail_approved_path',
    'replacement_thumbnail_approved_sha256',
    'replacement_thumbnail_path'
  ];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Imported lesson artwork replacement requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is null
    or p_import_id !~ '^[a-z0-9][a-z0-9-]{0,127}$'
  then
    raise exception 'Imported lesson artwork replacement has an invalid import_id.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_replacements) <> 'array'
    or jsonb_array_length(p_replacements) < 1
    or jsonb_array_length(p_replacements) > 100
  then
    raise exception 'Imported lesson artwork replacement requires 1 to 100 replacements.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_replacements) as replacement(value)
    where jsonb_typeof(replacement.value) <> 'object'
      or not replacement.value ?& v_required_keys
      or replacement.value - v_required_keys <> '{}'::jsonb
      or exists (
        select 1
        from unnest(v_required_keys) as required(key)
        where jsonb_typeof(replacement.value -> required.key) <> 'string'
      )
  ) then
    raise exception 'Imported lesson artwork replacement payload has invalid keys or values.'
      using errcode = '22023';
  end if;
  if (
    select count(*)
    from (
      select distinct value ->> 'lesson_id'
      from jsonb_array_elements(p_replacements)
    ) as distinct_lessons
  ) <> jsonb_array_length(p_replacements) then
    raise exception 'Imported lesson artwork replacement contains duplicate lesson IDs.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('course-import-catalog-mutation', 0)
  );

  for v_item in select value from jsonb_array_elements(p_replacements)
  loop
    begin
      v_lesson_id := (v_item ->> 'lesson_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Imported lesson artwork replacement has an invalid lesson ID.'
        using errcode = '22023';
    end;

    if (v_item ->> 'expected_thumbnail_approved_sha256') !~ '^[0-9a-f]{64}$'
      or (v_item ->> 'replacement_thumbnail_approved_sha256') !~ '^[0-9a-f]{64}$'
      or (v_item ->> 'expected_thumbnail_asset_key') !~ '^[a-z0-9][a-z0-9-]{0,127}$'
      or (v_item ->> 'replacement_thumbnail_asset_key') !~ '^[a-z0-9][a-z0-9-]{0,127}$'
      or (v_item ->> 'expected_thumbnail_approved_path') !~ '^course-assets/thumbnails/[a-z0-9/_-]+\.webp$'
      or (v_item ->> 'replacement_thumbnail_approved_path') !~ '^course-assets/thumbnails/[a-z0-9/_-]+\.webp$'
      or (v_item ->> 'expected_thumbnail_path') !~ '^courses/[a-z0-9-]+/v[0-9]+/thumbnails/[a-z0-9-]+-[0-9a-f]{64}\.webp$'
      or (v_item ->> 'replacement_thumbnail_path') !~ '^courses/[a-z0-9-]+/v[0-9]+/thumbnails/[a-z0-9-]+-[0-9a-f]{64}\.webp$'
      or (v_item ->> 'replacement_thumbnail_path') not like
        '%' || (v_item ->> 'replacement_thumbnail_approved_sha256') || '.webp'
    then
      raise exception 'Imported lesson artwork replacement has invalid provenance values.'
        using errcode = '22023';
    end if;

    select * into v_row
    from public.lessons
    where id = v_lesson_id
    for update;

    if not found
      or v_row.content_import_id is distinct from p_import_id
      or v_row.thumbnail_asset_key is distinct from (v_item ->> 'expected_thumbnail_asset_key')
      or v_row.thumbnail_approved_path is distinct from (v_item ->> 'expected_thumbnail_approved_path')
      or v_row.thumbnail_approved_sha256 is distinct from (v_item ->> 'expected_thumbnail_approved_sha256')
      or v_row.thumbnail_path is distinct from (v_item ->> 'expected_thumbnail_path')
    then
      raise exception 'Imported lesson artwork replacement refused: current provenance does not match the expected rollback point.'
        using errcode = '40001';
    end if;

    if not exists (
      select 1
      from storage.objects
      where bucket_id = 'content'
        and name = (v_item ->> 'replacement_thumbnail_path')
    ) then
      raise exception 'Imported lesson artwork replacement refused: replacement object is missing.'
        using errcode = '22023';
    end if;
  end loop;

  perform set_config('bmh.replace_import_artwork_id', p_import_id, true);
  for v_item in select value from jsonb_array_elements(p_replacements)
  loop
    v_lesson_id := (v_item ->> 'lesson_id')::uuid;
    update public.lessons
    set thumbnail_asset_key = v_item ->> 'replacement_thumbnail_asset_key',
        thumbnail_approved_path = v_item ->> 'replacement_thumbnail_approved_path',
        thumbnail_approved_sha256 = v_item ->> 'replacement_thumbnail_approved_sha256',
        thumbnail_path = v_item ->> 'replacement_thumbnail_path'
    where id = v_lesson_id;
    v_count := v_count + 1;
  end loop;
  perform set_config('bmh.replace_import_artwork_id', '', true);

  return jsonb_build_object(
    'status', 'replaced',
    'import_id', p_import_id,
    'replacement_count', v_count
  );
end;
$$;

revoke all on function public.fn_replace_imported_lesson_artwork(text, jsonb)
from public, anon, authenticated;
grant execute on function public.fn_replace_imported_lesson_artwork(text, jsonb)
to service_role;
