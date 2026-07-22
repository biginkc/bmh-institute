-- Replace only the checksum-addressed pre-play poster path on released imported
-- video blocks. Preserve immutable release evidence and append an exact catalog
-- correction record instead of rewriting the original release attestation.

create table public.content_import_video_poster_replacement_records (
  id uuid primary key default gen_random_uuid(),
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_payload_sha256 text not null check (client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  approval_evidence_sha256 text not null check (approval_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  preflight_evidence_sha256 text not null check (preflight_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_count integer not null check (replacement_count between 1 and 100),
  replacements jsonb not null check (jsonb_typeof(replacements) = 'array'),
  replaced_at timestamptz not null default now(),
  unique (import_id, database_payload_sha256, client_payload_sha256)
);

comment on table public.content_import_video_poster_replacement_records is
  'Append-only checksum evidence for exact poster-path corrections made after an imported course release.';

alter table public.content_import_video_poster_replacement_records enable row level security;
revoke all on table public.content_import_video_poster_replacement_records
from public, anon, authenticated;

create or replace function public.fn_guard_import_video_poster_replacement_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.replace_video_posters_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.replace_video_posters_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Imported video poster replacement records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_import_video_poster_replacement_record()
from public, anon, authenticated;

create trigger content_import_video_poster_replacement_records_guard
before insert or update or delete on public.content_import_video_poster_replacement_records
for each row execute function public.fn_guard_import_video_poster_replacement_record();

create or replace function public.fn_replace_released_imported_video_posters(
  p_import_id text,
  p_replacements jsonb,
  p_client_payload_sha256 text,
  p_approval_evidence_sha256 text,
  p_expected_catalog_sha256 text,
  p_preflight_evidence_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replacement_count integer;
  v_storage_prefix text;
  v_payload_sha256 text;
  v_latest_replacement_catalog_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_updated_count integer;
  v_already_replaced_count integer;
  v_required_keys constant text[] := array[
    'block_id',
    'poster_asset_key',
    'expected_content',
    'expected_poster_path',
    'expected_poster_sha256',
    'expected_size_bytes',
    'replacement_poster_path',
    'replacement_poster_sha256',
    'replacement_size_bytes'
  ];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released imported video poster replacement requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}-v[0-9]+$' then
    raise exception 'Released imported video poster replacement has an invalid versioned import_id.'
      using errcode = '22023';
  end if;
  if p_approval_evidence_sha256 is null or p_approval_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Released imported video poster replacement requires exact approval evidence.'
      using errcode = '22023';
  end if;
  if p_client_payload_sha256 is null or p_client_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Released imported video poster replacement requires the exact client payload checksum.'
      using errcode = '22023';
  end if;
  if p_expected_catalog_sha256 is null or p_expected_catalog_sha256 !~ '^[0-9a-f]{64}$'
    or p_preflight_evidence_sha256 is null or p_preflight_evidence_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released imported video poster replacement requires an exact production preflight.'
      using errcode = '22023';
  end if;
  if p_replacements is null or jsonb_typeof(p_replacements) <> 'array' then
    raise exception 'Released imported video poster replacement payload must be an array.'
      using errcode = '22023';
  end if;

  v_replacement_count := jsonb_array_length(p_replacements);
  if v_replacement_count < 1 or v_replacement_count > 100 then
    raise exception 'Released imported video poster replacement requires 1 to 100 replacements.'
      using errcode = '22023';
  end if;
  v_storage_prefix := 'courses/' || regexp_replace(p_import_id, '-v([0-9]+)$', '/v\1');
  v_payload_sha256 := encode(sha256(convert_to(p_replacements::text, 'UTF8')), 'hex');

  if exists (
    select 1
    from jsonb_array_elements(p_replacements) replacement(value)
    where jsonb_typeof(replacement.value) <> 'object'
      or not replacement.value ?& v_required_keys
      or replacement.value - v_required_keys <> '{}'::jsonb
      or jsonb_typeof(replacement.value -> 'block_id') <> 'string'
      or replacement.value ->> 'block_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(replacement.value -> 'poster_asset_key') <> 'string'
      or replacement.value ->> 'poster_asset_key' !~ '^poster-[a-z0-9][a-z0-9-]{0,120}$'
      or jsonb_typeof(replacement.value -> 'expected_content') <> 'object'
      or jsonb_typeof(replacement.value -> 'expected_content' -> 'poster_path') <> 'string'
      or replacement.value -> 'expected_content' ->> 'poster_path' <>
        replacement.value ->> 'expected_poster_path'
      or jsonb_typeof(replacement.value -> 'expected_poster_path') <> 'string'
      or jsonb_typeof(replacement.value -> 'expected_poster_sha256') <> 'string'
      or jsonb_typeof(replacement.value -> 'replacement_poster_path') <> 'string'
      or jsonb_typeof(replacement.value -> 'replacement_poster_sha256') <> 'string'
      or jsonb_typeof(replacement.value -> 'expected_size_bytes') <> 'number'
      or (replacement.value ->> 'expected_size_bytes')::numeric % 1 <> 0
      or (replacement.value ->> 'expected_size_bytes')::numeric < 1
      or (replacement.value ->> 'expected_size_bytes')::numeric > 5242880
      or jsonb_typeof(replacement.value -> 'replacement_size_bytes') <> 'number'
      or (replacement.value ->> 'replacement_size_bytes')::numeric % 1 <> 0
      or (replacement.value ->> 'replacement_size_bytes')::numeric < 1
      or (replacement.value ->> 'replacement_size_bytes')::numeric > 5242880
      or replacement.value ->> 'expected_poster_sha256' !~ '^[0-9a-f]{64}$'
      or replacement.value ->> 'replacement_poster_sha256' !~ '^[0-9a-f]{64}$'
      or replacement.value ->> 'expected_poster_sha256' = replacement.value ->> 'replacement_poster_sha256'
      or replacement.value ->> 'expected_poster_path' !~
        '^courses/[a-z0-9-]+/v[0-9]+/posters/[a-z0-9-]+-[0-9a-f]{64}\.webp$'
      or replacement.value ->> 'replacement_poster_path' !~
        '^courses/[a-z0-9-]+/v[0-9]+/posters/[a-z0-9-]+-[0-9a-f]{64}\.webp$'
      or replacement.value ->> 'expected_poster_path' not like
        '%-' || (replacement.value ->> 'expected_poster_sha256') || '.webp'
      or replacement.value ->> 'replacement_poster_path' not like
        '%-' || (replacement.value ->> 'replacement_poster_sha256') || '.webp'
      or not starts_with(replacement.value ->> 'expected_poster_path', v_storage_prefix || '/posters/')
      or not starts_with(replacement.value ->> 'replacement_poster_path', v_storage_prefix || '/posters/')
      or replacement.value ->> 'replacement_poster_path' not like
        v_storage_prefix || '/posters/' || substring(replacement.value ->> 'poster_asset_key' from 8) || '-%'
      or replacement.value ->> 'expected_poster_path' <>
        replace(
          replacement.value ->> 'replacement_poster_path',
          replacement.value ->> 'replacement_poster_sha256',
          replacement.value ->> 'expected_poster_sha256'
        )
  ) then
    raise exception 'Released imported video poster replacement has malformed or noncanonical values.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct replacement.value ->> 'block_id')
    from jsonb_array_elements(p_replacements) replacement(value)
  ) <> v_replacement_count or (
    select count(distinct replacement.value ->> 'poster_asset_key')
    from jsonb_array_elements(p_replacements) replacement(value)
  ) <> v_replacement_count then
    raise exception 'Released imported video poster replacement block IDs and poster keys must be unique.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));

  perform 1
  from public.content_import_release_records release
  where release.import_id = p_import_id
  for share;
  if not found
    or not exists (
      select 1 from public.programs program
      where program.content_import_id = p_import_id and program.is_published
    )
    or exists (
      select 1 from public.courses course
      where course.content_import_id = p_import_id and not course.is_published
    )
  then
    raise exception 'Released imported video poster replacement requires the matching published release.'
      using errcode = '42501';
  end if;

  select count(*) into v_already_replaced_count
  from jsonb_array_elements(p_replacements) replacement(value)
  join public.content_blocks block
    on block.id = (replacement.value ->> 'block_id')::uuid
   and block.block_type = 'video'
   and block.content = jsonb_set(
     replacement.value -> 'expected_content',
     '{poster_path}',
     to_jsonb(replacement.value ->> 'replacement_poster_path'),
     false
   )
  join public.lessons lesson on lesson.id = block.lesson_id
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;

  if v_already_replaced_count = v_replacement_count then
    if exists (
      select 1
      from public.content_import_video_poster_replacement_records record
      where record.import_id = p_import_id
        and record.database_payload_sha256 = v_payload_sha256
        and record.client_payload_sha256 = p_client_payload_sha256
        and record.approval_evidence_sha256 = p_approval_evidence_sha256
        and record.preflight_evidence_sha256 = p_preflight_evidence_sha256
        and record.replacement_catalog_sha256 = public.fn_course_import_catalog_sha256(p_import_id)
        and not exists (
          select 1
          from jsonb_array_elements(p_replacements) replacement(value)
          where not exists (
            select 1 from storage.objects object
            where object.bucket_id = 'content'
              and object.name = replacement.value ->> 'replacement_poster_path'
              and coalesce(
                to_jsonb(object) -> 'user_metadata' ->> 'sha256',
                object.metadata ->> 'sha256'
              ) = replacement.value ->> 'replacement_poster_sha256'
              and coalesce(
                to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
                object.metadata ->> 'course_import_id'
              ) = p_import_id
          )
        )
    ) then
      return jsonb_build_object(
        'status', 'already_replaced',
        'import_id', p_import_id,
        'replacement_count', v_replacement_count,
        'catalog_sha256', public.fn_course_import_catalog_sha256(p_import_id)
      );
    end if;
    raise exception 'Released imported video poster replacement refused: current paths lack the exact audit record.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_replacements) replacement(value)
    where not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'content'
        and object.name = replacement.value ->> 'expected_poster_path'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'sha256',
          object.metadata ->> 'sha256'
        ) = replacement.value ->> 'expected_poster_sha256'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
          object.metadata ->> 'course_import_id'
        ) = p_import_id
        and coalesce(
          (to_jsonb(object) ->> 'size')::bigint,
          (object.metadata ->> 'size')::bigint,
          (object.metadata ->> 'contentLength')::bigint
        ) = (replacement.value ->> 'expected_size_bytes')::bigint
        and coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType') = 'image/webp'
    ) or not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'content'
        and object.name = replacement.value ->> 'replacement_poster_path'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'sha256',
          object.metadata ->> 'sha256'
        ) = replacement.value ->> 'replacement_poster_sha256'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
          object.metadata ->> 'course_import_id'
        ) = p_import_id
        and coalesce(
          (to_jsonb(object) ->> 'size')::bigint,
          (object.metadata ->> 'size')::bigint,
          (object.metadata ->> 'contentLength')::bigint
        ) = (replacement.value ->> 'replacement_size_bytes')::bigint
        and coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType') = 'image/webp'
    )
  ) then
    raise exception 'Released imported video poster replacement refused: exact old or new storage object is missing.'
      using errcode = '22023';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_prior_catalog_sha256 <> p_expected_catalog_sha256 then
    raise exception 'Released imported video poster replacement refused: catalog drifted from the exact production preflight.'
      using errcode = '40001';
  end if;
  select record.replacement_catalog_sha256 into v_latest_replacement_catalog_sha256
  from public.content_import_video_poster_replacement_records record
  where record.import_id = p_import_id
  order by record.replaced_at desc, record.id desc
  limit 1;
  if v_latest_replacement_catalog_sha256 is not null
    and v_prior_catalog_sha256 <> v_latest_replacement_catalog_sha256
  then
    raise exception 'Released imported video poster replacement refused: catalog drifted after its latest poster correction.'
      using errcode = '40001';
  end if;

  with replacements as (
    select
      (replacement.value ->> 'block_id')::uuid as block_id,
      replacement.value -> 'expected_content' as expected_content,
      replacement.value ->> 'expected_poster_path' as expected_poster_path,
      replacement.value ->> 'replacement_poster_path' as replacement_poster_path
    from jsonb_array_elements(p_replacements) replacement(value)
  )
  update public.content_blocks block
  set content = jsonb_set(
    block.content,
    '{poster_path}',
    to_jsonb(replacements.replacement_poster_path),
    false
  )
  from replacements, public.lessons lesson, public.modules module, public.courses course
  where block.id = replacements.block_id
    and block.block_type = 'video'
    and block.content = replacements.expected_content
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_replacement_count then
    raise exception 'Released imported video poster replacement refused: target, ownership, type, or expected path mismatch.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  perform set_config('bmh.replace_video_posters_import_id', p_import_id, true);
  perform set_config('bmh.replace_video_posters_payload_sha256', v_payload_sha256, true);
  insert into public.content_import_video_poster_replacement_records (
    import_id,
    prior_catalog_sha256,
    replacement_catalog_sha256,
    database_payload_sha256,
    client_payload_sha256,
    approval_evidence_sha256,
    preflight_evidence_sha256,
    replacement_count,
    replacements
  ) values (
    p_import_id,
    v_prior_catalog_sha256,
    v_replacement_catalog_sha256,
    v_payload_sha256,
    p_client_payload_sha256,
    p_approval_evidence_sha256,
    p_preflight_evidence_sha256,
    v_replacement_count,
    p_replacements
  );
  perform set_config('bmh.replace_video_posters_import_id', '', true);
  perform set_config('bmh.replace_video_posters_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'replaced',
    'import_id', p_import_id,
    'replacement_count', v_updated_count,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256
  );
end;
$$;

revoke all on function public.fn_replace_released_imported_video_posters(text, jsonb, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.fn_replace_released_imported_video_posters(text, jsonb, text, text, text, text)
to service_role;

-- The shared TEST canary is intentionally unreleased, so it needs a separate
-- one-shot compare-and-swap. Keeping this path distinct prevents canary logic
-- from weakening the released-course correction gate above.
create table public.content_import_canary_video_poster_replacement_records (
  id uuid primary key default gen_random_uuid(),
  import_id text not null,
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_payload_sha256 text not null check (client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  replacements jsonb not null check (jsonb_typeof(replacements) = 'array'),
  replaced_at timestamptz not null default now(),
  unique (import_id, database_payload_sha256, client_payload_sha256)
);

comment on table public.content_import_canary_video_poster_replacement_records is
  'Append-only evidence for the exact unreleased Tech Stack canary poster reconciliation.';

alter table public.content_import_canary_video_poster_replacement_records enable row level security;
revoke all on table public.content_import_canary_video_poster_replacement_records
from public, anon, authenticated;

create or replace function public.fn_guard_import_canary_video_poster_replacement_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.replace_canary_video_posters_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.replace_canary_video_posters_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Canary video poster replacement records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_import_canary_video_poster_replacement_record()
from public, anon, authenticated;

create trigger content_import_canary_video_poster_replacement_records_guard
before insert or update or delete on public.content_import_canary_video_poster_replacement_records
for each row execute function public.fn_guard_import_canary_video_poster_replacement_record();

create or replace function public.fn_replace_unreleased_imported_video_posters(
  p_import_id text,
  p_replacements jsonb,
  p_client_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload_sha256 text;
  v_storage_prefix text;
  v_updated_count integer;
  v_already_replaced_count integer;
  v_required_keys constant text[] := array[
    'block_id',
    'poster_asset_key',
    'expected_content',
    'expected_poster_path',
    'expected_poster_sha256',
    'expected_size_bytes',
    'replacement_poster_path',
    'replacement_poster_sha256',
    'replacement_size_bytes'
  ];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Canary video poster replacement requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is distinct from 'bmh-employee-training-canary-v1' then
    raise exception 'Canary video poster replacement is restricted to the exact Tech Stack canary.'
      using errcode = '22023';
  end if;
  if p_client_payload_sha256 is null or p_client_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Canary video poster replacement requires the exact client payload checksum.'
      using errcode = '22023';
  end if;
  if p_replacements is null
    or jsonb_typeof(p_replacements) <> 'array'
    or jsonb_array_length(p_replacements) <> 1
  then
    raise exception 'Canary video poster replacement requires exactly one replacement.'
      using errcode = '22023';
  end if;

  v_storage_prefix := 'courses/bmh-employee-training-canary/v1';
  v_payload_sha256 := encode(sha256(convert_to(p_replacements::text, 'UTF8')), 'hex');
  if exists (
    select 1
    from jsonb_array_elements(p_replacements) replacement(value)
    where jsonb_typeof(replacement.value) <> 'object'
      or not replacement.value ?& v_required_keys
      or replacement.value - v_required_keys <> '{}'::jsonb
      or jsonb_typeof(replacement.value -> 'block_id') <> 'string'
      or replacement.value ->> 'block_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
      or replacement.value ->> 'poster_asset_key' <> 'poster-video-slot-03-tech-stack'
      or jsonb_typeof(replacement.value -> 'expected_content') <> 'object'
      or replacement.value -> 'expected_content' ->> 'poster_path' <>
        replacement.value ->> 'expected_poster_path'
      or replacement.value ->> 'expected_poster_sha256' !~ '^[0-9a-f]{64}$'
      or replacement.value ->> 'replacement_poster_sha256' !~ '^[0-9a-f]{64}$'
      or replacement.value ->> 'expected_poster_sha256' = replacement.value ->> 'replacement_poster_sha256'
      or jsonb_typeof(replacement.value -> 'expected_size_bytes') <> 'number'
      or (replacement.value ->> 'expected_size_bytes')::numeric % 1 <> 0
      or (replacement.value ->> 'expected_size_bytes')::numeric not between 1 and 5242880
      or jsonb_typeof(replacement.value -> 'replacement_size_bytes') <> 'number'
      or (replacement.value ->> 'replacement_size_bytes')::numeric % 1 <> 0
      or (replacement.value ->> 'replacement_size_bytes')::numeric not between 1 and 5242880
      or replacement.value ->> 'expected_poster_path' !~
        '^courses/bmh-employee-training-canary/v1/posters/video-slot-03-tech-stack-[0-9a-f]{64}\.webp$'
      or replacement.value ->> 'replacement_poster_path' !~
        '^courses/bmh-employee-training-canary/v1/posters/video-slot-03-tech-stack-[0-9a-f]{64}\.webp$'
      or not starts_with(replacement.value ->> 'expected_poster_path', v_storage_prefix || '/posters/')
      or not starts_with(replacement.value ->> 'replacement_poster_path', v_storage_prefix || '/posters/')
      or replacement.value ->> 'expected_poster_path' not like
        '%-' || (replacement.value ->> 'expected_poster_sha256') || '.webp'
      or replacement.value ->> 'replacement_poster_path' not like
        '%-' || (replacement.value ->> 'replacement_poster_sha256') || '.webp'
      or replacement.value ->> 'expected_poster_path' <>
        replace(
          replacement.value ->> 'replacement_poster_path',
          replacement.value ->> 'replacement_poster_sha256',
          replacement.value ->> 'expected_poster_sha256'
        )
  ) then
    raise exception 'Canary video poster replacement has malformed or noncanonical values.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));

  if exists (
    select 1 from public.content_import_release_records release
    where release.import_id = p_import_id
  ) or not exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and not program.is_published
  ) or not exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and not course.is_published
  ) or exists (
    select 1 from public.programs program
    where program.content_import_id = p_import_id and program.is_published
  ) or exists (
    select 1 from public.courses course
    where course.content_import_id = p_import_id and course.is_published
  ) then
    raise exception 'Canary video poster replacement requires the matching unreleased and unpublished import.'
      using errcode = '42501';
  end if;

  select count(*) into v_already_replaced_count
  from jsonb_array_elements(p_replacements) replacement(value)
  join public.content_blocks block
    on block.id = (replacement.value ->> 'block_id')::uuid
   and block.block_type = 'video'
   and block.content = jsonb_set(
     replacement.value -> 'expected_content',
     '{poster_path}',
     to_jsonb(replacement.value ->> 'replacement_poster_path'),
     false
   )
  join public.lessons lesson on lesson.id = block.lesson_id
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;

  if v_already_replaced_count = 1 then
    if exists (
      select 1
      from public.content_import_canary_video_poster_replacement_records record
      where record.import_id = p_import_id
        and record.database_payload_sha256 = v_payload_sha256
        and record.client_payload_sha256 = p_client_payload_sha256
    ) and not exists (
      select 1
      from jsonb_array_elements(p_replacements) replacement(value)
      where not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'content'
          and object.name = replacement.value ->> 'replacement_poster_path'
          and coalesce(
            to_jsonb(object) -> 'user_metadata' ->> 'sha256',
            object.metadata ->> 'sha256'
          ) = replacement.value ->> 'replacement_poster_sha256'
          and coalesce(
            to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
            object.metadata ->> 'course_import_id'
          ) = p_import_id
      )
    ) then
      return jsonb_build_object(
        'status', 'already_replaced',
        'import_id', p_import_id,
        'replacement_count', 1
      );
    end if;
    raise exception 'Canary video poster replacement refused: current path lacks the exact audit record.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_replacements) replacement(value)
    where not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'content'
        and object.name = replacement.value ->> 'expected_poster_path'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'sha256',
          object.metadata ->> 'sha256'
        ) = replacement.value ->> 'expected_poster_sha256'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
          object.metadata ->> 'course_import_id'
        ) = p_import_id
        and coalesce(
          (to_jsonb(object) ->> 'size')::bigint,
          (object.metadata ->> 'size')::bigint,
          (object.metadata ->> 'contentLength')::bigint
        ) = (replacement.value ->> 'expected_size_bytes')::bigint
        and coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType') = 'image/webp'
    ) or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'content'
        and object.name = replacement.value ->> 'replacement_poster_path'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'sha256',
          object.metadata ->> 'sha256'
        ) = replacement.value ->> 'replacement_poster_sha256'
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
          object.metadata ->> 'course_import_id'
        ) = p_import_id
        and coalesce(
          (to_jsonb(object) ->> 'size')::bigint,
          (object.metadata ->> 'size')::bigint,
          (object.metadata ->> 'contentLength')::bigint
        ) = (replacement.value ->> 'replacement_size_bytes')::bigint
        and coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType') = 'image/webp'
    )
  ) then
    raise exception 'Canary video poster replacement refused: exact old or new storage object is missing.'
      using errcode = '22023';
  end if;

  with replacements as (
    select
      (replacement.value ->> 'block_id')::uuid as block_id,
      replacement.value -> 'expected_content' as expected_content,
      replacement.value ->> 'replacement_poster_path' as replacement_poster_path
    from jsonb_array_elements(p_replacements) replacement(value)
  )
  update public.content_blocks block
  set content = jsonb_set(
    block.content,
    '{poster_path}',
    to_jsonb(replacements.replacement_poster_path),
    false
  )
  from replacements, public.lessons lesson, public.modules module, public.courses course
  where block.id = replacements.block_id
    and block.block_type = 'video'
    and block.content = replacements.expected_content
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'Canary video poster replacement refused: target, ownership, type, or expected content mismatch.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.replace_canary_video_posters_import_id', p_import_id, true);
  perform set_config('bmh.replace_canary_video_posters_payload_sha256', v_payload_sha256, true);
  insert into public.content_import_canary_video_poster_replacement_records (
    import_id,
    database_payload_sha256,
    client_payload_sha256,
    replacements
  ) values (
    p_import_id,
    v_payload_sha256,
    p_client_payload_sha256,
    p_replacements
  );
  perform set_config('bmh.replace_canary_video_posters_import_id', '', true);
  perform set_config('bmh.replace_canary_video_posters_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'replaced',
    'import_id', p_import_id,
    'replacement_count', v_updated_count
  );
end;
$$;

revoke all on function public.fn_replace_unreleased_imported_video_posters(text, jsonb, text)
from public, anon, authenticated;
grant execute on function public.fn_replace_unreleased_imported_video_posters(text, jsonb, text)
to service_role;
