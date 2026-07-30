-- Replace exactly the checksum-addressed Video Zero master and caption paths on
-- the released BMH employee training welcome block. Preserve release history,
-- retain the prior objects for rollback, and append exact replacement evidence.

create table public.content_import_welcome_video_replacement_records (
  id uuid primary key default gen_random_uuid(),
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_payload_sha256 text not null check (client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  approval_evidence_sha256 text not null check (approval_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  replacements jsonb not null check (
    jsonb_typeof(replacements) = 'array' and jsonb_array_length(replacements) = 1
  ),
  replaced_at timestamptz not null default now(),
  unique (import_id, database_payload_sha256, client_payload_sha256)
);

comment on table public.content_import_welcome_video_replacement_records is
  'Append-only evidence for the exact released Video Zero master and caption replacement.';

alter table public.content_import_welcome_video_replacement_records enable row level security;
revoke all on table public.content_import_welcome_video_replacement_records
from public, anon, authenticated;
grant select on table public.content_import_welcome_video_replacement_records
to service_role;

-- Create the append-only rollback ledger before compiling the replacement
-- function because the replacement path locks and queries it to make rollback
-- terminal before any replay can mutate content.
create table public.content_import_welcome_video_rollback_records (
  id uuid primary key default gen_random_uuid(),
  replacement_record_id uuid not null unique
    references public.content_import_welcome_video_replacement_records(id) on delete restrict,
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  restored_catalog_sha256 text not null check (restored_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_payload_sha256 text not null check (client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  approval_evidence_sha256 text not null check (approval_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  rolled_back_at timestamptz not null default now(),
  unique (import_id, database_payload_sha256, client_payload_sha256)
);

comment on table public.content_import_welcome_video_rollback_records is
  'Append-only evidence that the exact audited Video Zero replacement was atomically restored.';

alter table public.content_import_welcome_video_rollback_records enable row level security;
revoke all on table public.content_import_welcome_video_rollback_records
from public, anon, authenticated;
grant select on table public.content_import_welcome_video_rollback_records
to service_role;

create or replace function public.fn_guard_import_welcome_video_replacement_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.replace_welcome_video_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.replace_welcome_video_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Imported welcome video replacement records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_import_welcome_video_replacement_record()
from public, anon, authenticated;

create trigger content_import_welcome_video_replacement_records_guard
before insert or update or delete on public.content_import_welcome_video_replacement_records
for each row execute function public.fn_guard_import_welcome_video_replacement_record();

create or replace function public.fn_replace_released_imported_welcome_video(
  p_import_id text,
  p_replacements jsonb,
  p_client_payload_sha256 text,
  p_approval_evidence_sha256 text,
  p_expected_catalog_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replacement jsonb;
  v_payload_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_expected_content jsonb;
  v_expected_replacement jsonb;
  v_expected_payload jsonb;
  v_replaced_content jsonb;
  v_updated_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released welcome video replacement requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id <> 'bmh-employee-training-v1' then
    raise exception 'Released welcome video replacement is restricted to bmh-employee-training-v1.'
      using errcode = '22023';
  end if;
  if p_client_payload_sha256 is null or p_client_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_approval_evidence_sha256 is null or p_approval_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_catalog_sha256 is null or p_expected_catalog_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released welcome video replacement requires exact payload, approval, and catalog checksums.'
      using errcode = '22023';
  end if;
  if p_client_payload_sha256 <>
      'ce6b666c7f13eb9f235b5484916c98aef03752c74afcffd430a19a65af02b900'
    or p_approval_evidence_sha256 <>
      '6997993901d79abec0a542dad342b67e990cfda6b7b3b7abbce484b5e782b7b3'
  then
    raise exception 'Released welcome video replacement checksums do not match the reviewed operation.'
      using errcode = '22023';
  end if;
  if p_replacements is null
    or jsonb_typeof(p_replacements) <> 'array'
    or jsonb_array_length(p_replacements) <> 1
  then
    raise exception 'Released welcome video replacement requires exactly one replacement.'
      using errcode = '22023';
  end if;

  v_replacement := p_replacements -> 0;
  v_expected_content := jsonb_build_object(
    'title', 'Welcome and the Service Playbook',
    'file_path',
      'courses/bmh-employee-training/v1/videos/video-slot-01-welcome.493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72.mp4',
    'part_label', 'Part A',
    'poster_path',
      'courses/bmh-employee-training/v1/posters/video-slot-01-welcome-2e481279cc270f73c2af666857dd7379c529679388d5ccd41b0d8eace71c11b0.webp',
    'caption_path',
      'courses/bmh-employee-training/v1/captions/video-slot-01-welcome.54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11.vtt',
    'duration_seconds', 246.186
  );
  v_expected_replacement := jsonb_build_object(
    'block_id', 'e8d2c1d2-7a02-5b28-a807-9dad78b46306',
    'video_asset_key', 'video-slot-01-welcome',
    'caption_asset_key', 'caption-video-slot-01-welcome',
    'expected_content', v_expected_content,
    'expected_video_path',
      'courses/bmh-employee-training/v1/videos/video-slot-01-welcome.493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72.mp4',
    'expected_video_sha256',
      '493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72',
    'expected_video_size_bytes', 35190296,
    'expected_video_mime_type', 'video/mp4',
    'expected_caption_path',
      'courses/bmh-employee-training/v1/captions/video-slot-01-welcome.54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11.vtt',
    'expected_caption_sha256',
      '54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11',
    'expected_caption_size_bytes', 5636,
    'expected_caption_mime_type', 'text/vtt',
    'expected_duration_seconds', 246.186,
    'replacement_video_path',
      'courses/bmh-employee-training/v1/videos/video-slot-01-welcome.06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b.mp4',
    'replacement_video_sha256',
      '06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b',
    'replacement_video_size_bytes', 74404741,
    'replacement_video_mime_type', 'video/mp4',
    'replacement_caption_path',
      'courses/bmh-employee-training/v1/captions/video-slot-01-welcome.bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939.vtt',
    'replacement_caption_sha256',
      'bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939',
    'replacement_caption_size_bytes', 7629,
    'replacement_caption_mime_type', 'text/vtt',
    'replacement_duration_seconds', 318.351
  );
  v_expected_payload := jsonb_build_array(v_expected_replacement);
  v_payload_sha256 := encode(sha256(convert_to(p_replacements::text, 'UTF8')), 'hex');
  if p_replacements is distinct from v_expected_payload
    or v_payload_sha256 is distinct from encode(
      sha256(convert_to(v_expected_payload::text, 'UTF8')),
      'hex'
    )
  then
    raise exception 'Released welcome video replacement has malformed or noncanonical values.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('replace-released-welcome-video:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_welcome_video_replacement_records,
    public.content_import_welcome_video_rollback_records,
    public.programs,
    public.courses,
    public.program_courses,
    public.program_access,
    public.course_access,
    public.role_groups,
    public.modules,
    public.lessons,
    public.content_blocks,
    public.quizzes,
    public.questions,
    public.answer_options,
    public.assignments
  in share row exclusive mode;
  lock table storage.objects in share mode;

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
    raise exception 'Released welcome video replacement requires the matching published release.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.content_import_welcome_video_rollback_records rollback
    join public.content_import_welcome_video_replacement_records replacement
      on replacement.id = rollback.replacement_record_id
    where rollback.import_id = p_import_id
      and replacement.client_payload_sha256 = p_client_payload_sha256
      and replacement.approval_evidence_sha256 = p_approval_evidence_sha256
  ) then
    raise exception 'Released welcome video replacement was previously rolled back and is terminal.'
      using errcode = '40001';
  end if;

  v_replaced_content := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_expected_content,
        '{file_path}',
        to_jsonb(v_replacement ->> 'replacement_video_path'),
        false
      ),
      '{caption_path}',
      to_jsonb(v_replacement ->> 'replacement_caption_path'),
      false
    ),
    '{duration_seconds}',
    to_jsonb((v_replacement ->> 'replacement_duration_seconds')::numeric),
    false
  );

  if exists (
    select 1
    from public.content_blocks block
    join public.lessons lesson on lesson.id = block.lesson_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where block.id = (v_replacement ->> 'block_id')::uuid
      and block.block_type = 'video'
      and block.content = v_replaced_content
      and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
  ) then
    if exists (
      select 1
      from public.content_import_welcome_video_replacement_records record
      where record.import_id = p_import_id
        and record.database_payload_sha256 = v_payload_sha256
        and record.client_payload_sha256 = p_client_payload_sha256
        and record.approval_evidence_sha256 = p_approval_evidence_sha256
        and record.replacement_catalog_sha256 = public.fn_course_import_catalog_sha256(p_import_id)
    ) and not exists (
      select 1
      from (values
        (
          v_replacement ->> 'expected_video_path',
          v_replacement ->> 'expected_video_sha256',
          (v_replacement ->> 'expected_video_size_bytes')::bigint,
          'video/mp4'
        ),
        (
          v_replacement ->> 'expected_caption_path',
          v_replacement ->> 'expected_caption_sha256',
          (v_replacement ->> 'expected_caption_size_bytes')::bigint,
          'text/vtt'
        ),
        (
          v_replacement ->> 'replacement_video_path',
          v_replacement ->> 'replacement_video_sha256',
          (v_replacement ->> 'replacement_video_size_bytes')::bigint,
          'video/mp4'
        ),
        (
          v_replacement ->> 'replacement_caption_path',
          v_replacement ->> 'replacement_caption_sha256',
          (v_replacement ->> 'replacement_caption_size_bytes')::bigint,
          'text/vtt'
        )
      ) expected(path, checksum, size_bytes, mime_prefix)
      where not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'content'
          and object.name = expected.path
          and coalesce(
            to_jsonb(object) -> 'user_metadata' ->> 'sha256',
            object.metadata ->> 'sha256'
          ) = expected.checksum
          and coalesce(
            to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
            to_jsonb(object) -> 'user_metadata' ->> 'courseImportId',
            object.metadata ->> 'course_import_id',
            object.metadata ->> 'courseImportId'
          ) = p_import_id
          and coalesce(
            (to_jsonb(object) ->> 'size')::bigint,
            (object.metadata ->> 'size')::bigint,
            (object.metadata ->> 'contentLength')::bigint
          ) = expected.size_bytes
          and starts_with(
            coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType', ''),
            expected.mime_prefix
          )
      )
    ) then
      return jsonb_build_object(
        'status', 'already_replaced',
        'import_id', p_import_id,
        'replacement_count', 1,
        'catalog_sha256', public.fn_course_import_catalog_sha256(p_import_id)
      );
    end if;
    raise exception 'Released welcome video replacement refused: current paths lack the exact audit record.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from (values
      (
        v_replacement ->> 'expected_video_path',
        v_replacement ->> 'expected_video_sha256',
        (v_replacement ->> 'expected_video_size_bytes')::bigint,
        'video/mp4'
      ),
      (
        v_replacement ->> 'expected_caption_path',
        v_replacement ->> 'expected_caption_sha256',
        (v_replacement ->> 'expected_caption_size_bytes')::bigint,
        'text/vtt'
      ),
      (
        v_replacement ->> 'replacement_video_path',
        v_replacement ->> 'replacement_video_sha256',
        (v_replacement ->> 'replacement_video_size_bytes')::bigint,
        'video/mp4'
      ),
      (
        v_replacement ->> 'replacement_caption_path',
        v_replacement ->> 'replacement_caption_sha256',
        (v_replacement ->> 'replacement_caption_size_bytes')::bigint,
        'text/vtt'
      )
    ) expected(path, checksum, size_bytes, mime_prefix)
    where not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'content'
        and object.name = expected.path
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'sha256',
          object.metadata ->> 'sha256'
        ) = expected.checksum
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
          to_jsonb(object) -> 'user_metadata' ->> 'courseImportId',
          object.metadata ->> 'course_import_id',
          object.metadata ->> 'courseImportId'
        ) = p_import_id
        and coalesce(
          (to_jsonb(object) ->> 'size')::bigint,
          (object.metadata ->> 'size')::bigint,
          (object.metadata ->> 'contentLength')::bigint
        ) = expected.size_bytes
        and starts_with(
          coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType', ''),
          expected.mime_prefix
        )
    )
  ) then
    raise exception 'Released welcome video replacement refused: an exact old or new storage object is missing.'
      using errcode = '22023';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if p_expected_catalog_sha256 <>
      '6b1413b3c74aa9c35ba64ce12c7ec598d373fa876769a307d03c4d3e38352859'
    or v_prior_catalog_sha256 <> p_expected_catalog_sha256
  then
    raise exception 'Released welcome video replacement refused: catalog drifted from the exact production preflight.'
      using errcode = '40001';
  end if;

  update public.content_blocks block
  set content = v_replaced_content
  from public.lessons lesson, public.modules module, public.courses course
  where block.id = (v_replacement ->> 'block_id')::uuid
    and block.block_type = 'video'
    and block.content = v_expected_content
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Released welcome video replacement refused: target, ownership, type, or expected content mismatch.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  perform set_config('bmh.replace_welcome_video_import_id', p_import_id, true);
  perform set_config('bmh.replace_welcome_video_payload_sha256', v_payload_sha256, true);
  insert into public.content_import_welcome_video_replacement_records (
    import_id,
    prior_catalog_sha256,
    replacement_catalog_sha256,
    database_payload_sha256,
    client_payload_sha256,
    approval_evidence_sha256,
    replacements
  ) values (
    p_import_id,
    v_prior_catalog_sha256,
    v_replacement_catalog_sha256,
    v_payload_sha256,
    p_client_payload_sha256,
    p_approval_evidence_sha256,
    p_replacements
  );
  perform set_config('bmh.replace_welcome_video_import_id', '', true);
  perform set_config('bmh.replace_welcome_video_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'replaced',
    'import_id', p_import_id,
    'replacement_count', v_updated_count,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256,
    'retained_rollback_video_path', v_replacement ->> 'expected_video_path',
    'retained_rollback_caption_path', v_replacement ->> 'expected_caption_path'
  );
end;
$$;

revoke all on function public.fn_replace_released_imported_welcome_video(text, jsonb, text, text, text)
from public, anon, authenticated;
grant execute on function public.fn_replace_released_imported_welcome_video(text, jsonb, text, text, text)
to service_role;

-- Exact emergency rollback for this one replacement. The prior checksum-addressed
-- objects are deliberately retained; this function restores only the audited
-- preflight content after proving both the replacement state and all four
-- storage objects still match the immutable replacement record.
create or replace function public.fn_guard_import_welcome_video_rollback_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.rollback_welcome_video_replacement_record_id', true), '') <> new.replacement_record_id::text
    or coalesce(current_setting('bmh.rollback_welcome_video_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Imported welcome video rollback records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_import_welcome_video_rollback_record()
from public, anon, authenticated;

create trigger content_import_welcome_video_rollback_records_guard
before insert or update or delete on public.content_import_welcome_video_rollback_records
for each row execute function public.fn_guard_import_welcome_video_rollback_record();

create or replace function public.fn_rollback_released_imported_welcome_video(
  p_import_id text,
  p_database_payload_sha256 text,
  p_client_payload_sha256 text,
  p_approval_evidence_sha256 text,
  p_expected_replacement_catalog_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.content_import_welcome_video_replacement_records%rowtype;
  v_replacement jsonb;
  v_expected_content jsonb;
  v_replaced_content jsonb;
  v_current_catalog_sha256 text;
  v_restored_catalog_sha256 text;
  v_updated_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released welcome video rollback requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id <> 'bmh-employee-training-v1'
    or p_database_payload_sha256 is null
    or p_database_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_client_payload_sha256 <>
      'ce6b666c7f13eb9f235b5484916c98aef03752c74afcffd430a19a65af02b900'
    or p_approval_evidence_sha256 <>
      '6997993901d79abec0a542dad342b67e990cfda6b7b3b7abbce484b5e782b7b3'
    or p_expected_replacement_catalog_sha256 is null
    or p_expected_replacement_catalog_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released welcome video rollback identifiers do not match the reviewed operation.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('replace-released-welcome-video:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_welcome_video_replacement_records,
    public.content_import_welcome_video_rollback_records,
    public.programs,
    public.courses,
    public.program_courses,
    public.program_access,
    public.course_access,
    public.role_groups,
    public.modules,
    public.lessons,
    public.content_blocks,
    public.quizzes,
    public.questions,
    public.answer_options,
    public.assignments
  in share row exclusive mode;
  lock table storage.objects in share mode;

  select record.*
  into strict v_record
  from public.content_import_welcome_video_replacement_records record
  where record.import_id = p_import_id
    and record.database_payload_sha256 = p_database_payload_sha256
    and record.client_payload_sha256 = p_client_payload_sha256
    and record.approval_evidence_sha256 = p_approval_evidence_sha256
    and record.replacement_catalog_sha256 = p_expected_replacement_catalog_sha256
    and record.prior_catalog_sha256 =
      '6b1413b3c74aa9c35ba64ce12c7ec598d373fa876769a307d03c4d3e38352859';

  v_replacement := v_record.replacements -> 0;
  if jsonb_typeof(v_replacement) <> 'object'
    or v_replacement ->> 'block_id' <> 'e8d2c1d2-7a02-5b28-a807-9dad78b46306'
    or v_replacement ->> 'expected_video_sha256' <>
      '493de8a5e0663ad577ba46d6d5befce33e9640f250677095094978714d22ac72'
    or v_replacement ->> 'replacement_video_sha256' <>
      '06f77dbc78d0d17175108e2dafbfed9888617cdf9196c5dcc7fce3f9c4f7978b'
    or v_replacement ->> 'expected_caption_sha256' <>
      '54150f0e7f8c691b32ad0767934db2da0ac7ef9bcdb4ff73e3147a79ba262a11'
    or v_replacement ->> 'replacement_caption_sha256' <>
      'bf4519c61bfe9ccf1fde14bb66b866d29805546c40dbfbdaee3b378aec974939'
  then
    raise exception 'Released welcome video rollback record is not the reviewed replacement.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (values
      (
        v_replacement ->> 'expected_video_path',
        v_replacement ->> 'expected_video_sha256',
        (v_replacement ->> 'expected_video_size_bytes')::bigint,
        'video/mp4'
      ),
      (
        v_replacement ->> 'expected_caption_path',
        v_replacement ->> 'expected_caption_sha256',
        (v_replacement ->> 'expected_caption_size_bytes')::bigint,
        'text/vtt'
      ),
      (
        v_replacement ->> 'replacement_video_path',
        v_replacement ->> 'replacement_video_sha256',
        (v_replacement ->> 'replacement_video_size_bytes')::bigint,
        'video/mp4'
      ),
      (
        v_replacement ->> 'replacement_caption_path',
        v_replacement ->> 'replacement_caption_sha256',
        (v_replacement ->> 'replacement_caption_size_bytes')::bigint,
        'text/vtt'
      )
    ) expected(path, checksum, size_bytes, mime_prefix)
    where not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'content'
        and object.name = expected.path
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'sha256',
          object.metadata ->> 'sha256'
        ) = expected.checksum
        and coalesce(
          to_jsonb(object) -> 'user_metadata' ->> 'course_import_id',
          to_jsonb(object) -> 'user_metadata' ->> 'courseImportId',
          object.metadata ->> 'course_import_id',
          object.metadata ->> 'courseImportId'
        ) = p_import_id
        and coalesce(
          (to_jsonb(object) ->> 'size')::bigint,
          (object.metadata ->> 'size')::bigint,
          (object.metadata ->> 'contentLength')::bigint
        ) = expected.size_bytes
        and starts_with(
          coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType', ''),
          expected.mime_prefix
        )
    )
  ) then
    raise exception 'Released welcome video rollback refused: an exact old or new storage object is missing.'
      using errcode = '22023';
  end if;

  v_expected_content := v_replacement -> 'expected_content';
  v_replaced_content := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_expected_content,
        '{file_path}',
        to_jsonb(v_replacement ->> 'replacement_video_path'),
        false
      ),
      '{caption_path}',
      to_jsonb(v_replacement ->> 'replacement_caption_path'),
      false
    ),
    '{duration_seconds}',
    to_jsonb((v_replacement ->> 'replacement_duration_seconds')::numeric),
    false
  );
  v_current_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);

  if exists (
    select 1
    from public.content_blocks block
    join public.lessons lesson on lesson.id = block.lesson_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where block.id = (v_replacement ->> 'block_id')::uuid
      and block.block_type = 'video'
      and block.content = v_expected_content
      and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id
  ) then
    if v_current_catalog_sha256 = v_record.prior_catalog_sha256
      and exists (
        select 1
        from public.content_import_welcome_video_rollback_records rollback
        where rollback.replacement_record_id = v_record.id
          and rollback.import_id = p_import_id
          and rollback.replacement_catalog_sha256 = v_record.replacement_catalog_sha256
          and rollback.restored_catalog_sha256 = v_record.prior_catalog_sha256
          and rollback.database_payload_sha256 = p_database_payload_sha256
          and rollback.client_payload_sha256 = p_client_payload_sha256
          and rollback.approval_evidence_sha256 = p_approval_evidence_sha256
      )
    then
      return jsonb_build_object(
        'status', 'already_rolled_back',
        'import_id', p_import_id,
        'catalog_sha256', v_current_catalog_sha256
      );
    end if;
    raise exception 'Released welcome video rollback refused: prior content has catalog drift.'
      using errcode = '40001';
  end if;

  if v_current_catalog_sha256 <> v_record.replacement_catalog_sha256 then
    raise exception 'Released welcome video rollback refused: replacement catalog drifted.'
      using errcode = '40001';
  end if;

  update public.content_blocks block
  set content = v_expected_content
  from public.lessons lesson, public.modules module, public.courses course
  where block.id = (v_replacement ->> 'block_id')::uuid
    and block.block_type = 'video'
    and block.content = v_replaced_content
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Released welcome video rollback refused: exact replacement content is absent.'
      using errcode = '40001';
  end if;

  v_restored_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_restored_catalog_sha256 <> v_record.prior_catalog_sha256 then
    raise exception 'Released welcome video rollback failed to restore the exact prior catalog.'
      using errcode = '40001';
  end if;

  perform set_config(
    'bmh.rollback_welcome_video_replacement_record_id',
    v_record.id::text,
    true
  );
  perform set_config(
    'bmh.rollback_welcome_video_payload_sha256',
    p_database_payload_sha256,
    true
  );
  insert into public.content_import_welcome_video_rollback_records (
    replacement_record_id,
    import_id,
    replacement_catalog_sha256,
    restored_catalog_sha256,
    database_payload_sha256,
    client_payload_sha256,
    approval_evidence_sha256
  ) values (
    v_record.id,
    p_import_id,
    v_record.replacement_catalog_sha256,
    v_restored_catalog_sha256,
    p_database_payload_sha256,
    p_client_payload_sha256,
    p_approval_evidence_sha256
  );
  perform set_config('bmh.rollback_welcome_video_replacement_record_id', '', true);
  perform set_config('bmh.rollback_welcome_video_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'rolled_back',
    'import_id', p_import_id,
    'catalog_sha256', v_restored_catalog_sha256,
    'retained_replacement_video_path', v_replacement ->> 'replacement_video_path',
    'retained_replacement_caption_path', v_replacement ->> 'replacement_caption_path'
  );
exception
  when no_data_found then
    raise exception 'Released welcome video rollback refused: exact audit record not found.'
      using errcode = '40001';
  when too_many_rows then
    raise exception 'Released welcome video rollback refused: duplicate audit records found.'
      using errcode = '40001';
end;
$$;

revoke all on function public.fn_rollback_released_imported_welcome_video(text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.fn_rollback_released_imported_welcome_video(text, text, text, text, text)
to service_role;
