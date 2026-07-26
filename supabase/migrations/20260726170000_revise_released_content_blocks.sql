-- Apply the one exact 44-block correction that was omitted from the released
-- BMH employee-training catalog. The original release receipt and quiz
-- revision ledger remain immutable. This operation records a separate
-- append-only correction layered over that history.

set lock_timeout = '10s';

create table public.content_import_released_content_block_revision_records (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  original_release_manifest_sha256 text not null check (original_release_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  expected_active_manifest_sha256 text not null check (expected_active_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  replacement_catalog_sha256 text not null check (replacement_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  database_payload_sha256 text not null check (database_payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_payload_sha256 text not null check (client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  guide_update_count integer not null check (guide_update_count = 19),
  flashcard_update_count integer not null check (flashcard_update_count = 19),
  role_play_insert_count integer not null check (role_play_insert_count = 6),
  mutations jsonb not null check (jsonb_typeof(mutations) = 'array' and jsonb_array_length(mutations) = 44),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  revised_at timestamptz not null default now(),
  revised_by uuid,
  primary key (import_id, manifest_sha256)
);

comment on table public.content_import_released_content_block_revision_records is
  'Immutable audit evidence for the exact guide, flashcard, and role-play correction layered over a released imported catalog.';

alter table public.content_import_released_content_block_revision_records enable row level security;
revoke all on table public.content_import_released_content_block_revision_records
from public, anon, authenticated;
grant select on table public.content_import_released_content_block_revision_records
to service_role;

create or replace function public.fn_guard_import_released_content_block_revision_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.revise_content_blocks_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.revise_content_blocks_payload_sha256', true), '') <> new.database_payload_sha256
  then
    raise exception 'Released content block revision records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_import_released_content_block_revision_record()
from public, anon, authenticated;

create trigger content_import_released_content_block_revision_records_guard
before insert or update or delete on public.content_import_released_content_block_revision_records
for each row execute function public.fn_guard_import_released_content_block_revision_record();

-- Migration 033 correctly routes imported descendant inserts through the
-- generic apply marker. Preserve that rule and add only the exact released
-- content correction marker for the six approved role-play blocks.
create or replace function public.fn_guard_imported_content_block_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_course_published boolean;
  v_program_published boolean;
  v_apply_import_id text :=
    coalesce(current_setting('bmh.apply_import_id', true), '');
  v_revision_import_id text :=
    coalesce(current_setting('bmh.revise_content_blocks_import_id', true), '');
  v_revision_payload_sha256 text :=
    coalesce(current_setting('bmh.revise_content_blocks_payload_sha256', true), '');
begin
  select
    coalesce(lesson.content_import_id, course.content_import_id),
    course.is_published,
    program.is_published
  into v_import_id, v_course_published, v_program_published
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  left join public.program_courses membership on membership.course_id = course.id
  left join public.programs program on program.id = membership.program_id
  where lesson.id = new.lesson_id;

  if v_import_id is null then return new; end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_apply_import_id = v_import_id
  then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_import_id = 'bmh-employee-training-v1'
    and v_revision_import_id = v_import_id
    and v_revision_payload_sha256 =
      '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.program_id = (
          select membership.program_id
          from public.program_courses membership
          where membership.course_id = (
            select module.course_id
            from public.lessons lesson
            join public.modules module on module.id = lesson.module_id
            where lesson.id = new.lesson_id
          )
        )
        and release.manifest_sha256 =
          '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    )
  then
    return new;
  end if;
  raise exception 'Imported content blocks may only be created by the exact apply or released content revision operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_content_block_insert_v1()
from public, anon, authenticated;

drop trigger if exists guard_imported_catalog_insert on public.content_blocks;
create trigger guard_imported_catalog_insert
before insert on public.content_blocks
for each row execute function public.fn_guard_imported_content_block_insert_v1();

create or replace function public.fn_revise_released_content_blocks_v1(
  p_import_id text,
  p_expected_active_manifest_sha256 text,
  p_manifest_sha256 text,
  p_expected_catalog_sha256 text,
  p_mutations jsonb,
  p_client_payload_sha256 text,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original_release_manifest_sha256 constant text :=
    '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c';
  v_expected_active_manifest_sha256 constant text :=
    '440ec4d85bc6dc0aec9d471fb0f5ecbe0ca8c17236b3012e8b036b8d045a154d';
  v_target_manifest_sha256 constant text :=
    '585b72c923a560d2228f6149a5b906ec02958f19d62818dc5c109c3968345a33';
  v_expected_prior_catalog_sha256 constant text :=
    'e66250effa99bda93e8dd828077811585a5369e2e142bfa9bc5381f5ccd94eb4';
  v_expected_client_payload_sha256 constant text :=
    '81d918fd621bb82da935a81f06a08196ce27b2cb853fafcf0f8a2df88de8201b';
  v_expected_database_payload_sha256 constant text :=
    '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a';
  v_expected_block_ids constant uuid[] := array[
    'f5efd98c-30fe-5fe6-ad8a-707847e1d678',
    'bf88ca2d-81ff-52b2-ab60-d69e0678a132',
    'a23a0dcd-ee14-520f-a5c0-8eb08ef9dacf',
    '5c159ceb-0786-5e7f-a149-d16239038299',
    '64fe25d9-4fce-5b84-a467-c859c2a07ae9',
    '6ad5877c-7307-5c97-ab19-377fbc34b571',
    '8f9e3392-27f8-5f84-aa2c-bf4194287309',
    '31d20f19-4d81-57fe-a024-d36ae2584f68',
    '6e5037a7-c9ea-5f68-ab6c-5dfbe58805a1',
    'c5c9850e-ae26-50d4-af12-5694d5b3b36a',
    'd1e2a65f-2016-5537-aec9-6eb08a401b61',
    'b8d64acb-b409-5e57-a53b-c9836e24e030',
    '79a5aed1-9ac4-5bca-ab35-f6e44f2e2726',
    '0f6bcfc1-e7c9-5af2-aa24-78825a9b499b',
    '9260d95a-9dcb-5423-af80-be437e567bfc',
    '886e90cb-a9a0-5af4-a173-a82839f4a988',
    '7d3fd7b8-621b-5753-af30-a6dd94dac63a',
    '12c65c4e-3261-5bf7-acc5-6f4e74d2105c',
    '2fe7c3c0-e139-5da5-abbd-439da89fb7bc',
    'd47136ec-bc0f-5cbe-aeb9-5b820531a875',
    'e05e1e6d-7b91-5087-af60-363ef006156c',
    '8ca78415-4bf5-5cb5-a3c9-992998081cef',
    '02d9e7b9-7fd8-51e2-a734-5888218de569',
    '893f9c8d-bcaf-5758-a73d-dcf0b17488b1',
    '717bdad3-8cc1-514f-aaaa-825fa9d09310',
    '3ad8b440-bbe3-5881-ae95-f23c7f1341b2',
    '84917642-bda3-5572-a17c-b2988085fd7d',
    '7917e73f-97fc-57b9-a964-e0cd269a0b60',
    '00fe1e89-98ef-54ef-ae93-01a94d957586',
    '46dd1d95-8613-580f-ae70-83001ec0226f',
    'a19d7877-2daf-52f4-abdd-24ba300b7122',
    '20122866-6058-5af4-adc0-b03855133904',
    'c86c3fd2-8c29-572e-a63b-adba832cc878',
    '521dcd6b-b1bb-5aa7-a087-f33d1b037e38',
    'da987d32-a384-5efa-a15c-6db13ac52187',
    '17f2a608-feb1-54a6-a16e-bd1635d5cbbc',
    '5735bd2b-8496-51f3-af5a-2d356d12313d',
    '66858008-6252-55ae-a794-b186a14cd1ca',
    '608e1069-f815-5bdd-a771-df9c35818e0b',
    '13edb405-7ffe-5a7c-a6b2-c1b046ad3c72',
    'e15d77c2-3a3c-5354-ab29-94cb62fc5ac8',
    '6f3d0a9a-6bc4-500a-a33a-ab4d2ec28482',
    '8f5f3b5a-90c3-5d1e-a8bd-b5a744b6cf4f',
    '642c69cc-00eb-5b2e-ada5-081fbb3d4ffe'
  ]::uuid[];
  v_required_keys constant text[] := array[
    'action',
    'source_key',
    'block_id',
    'lesson_id',
    'block_type',
    'expected_content',
    'replacement_content',
    'sort_order',
    'is_required_for_completion',
    'replacement_sha256',
    'replacement_size_bytes'
  ];
  v_release_manifest_sha256 text;
  v_active_revision integer;
  v_active_manifest_sha256 text;
  v_active_catalog_sha256 text;
  v_database_payload_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_guide_update_count integer;
  v_flashcard_update_count integer;
  v_role_play_insert_count integer;
  v_updated_count integer;
  v_inserted_count integer;
  v_target_count integer;
  v_record public.content_import_released_content_block_revision_records%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released content block revision requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is distinct from 'bmh-employee-training-v1'
    or p_expected_active_manifest_sha256 is distinct from v_expected_active_manifest_sha256
    or p_manifest_sha256 is distinct from v_target_manifest_sha256
    or p_expected_catalog_sha256 is distinct from v_expected_prior_catalog_sha256
  then
    raise exception 'Released content block revision refused: release identity or checksum pin mismatch.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_evidence)) <> 7
    or not p_evidence ?& array[
      'operation',
      'original_release_manifest_sha256',
      'expected_active_manifest_sha256',
      'manifest_sha256',
      'expected_prior_catalog_sha256',
      'client_payload_sha256',
      'upload_receipt_sha256'
    ]
    or p_evidence ->> 'operation'
      is distinct from 'released_content_blocks_v1'
    or p_evidence ->> 'original_release_manifest_sha256'
      is distinct from v_original_release_manifest_sha256
    or p_evidence ->> 'expected_active_manifest_sha256'
      is distinct from v_expected_active_manifest_sha256
    or p_evidence ->> 'manifest_sha256'
      is distinct from v_target_manifest_sha256
    or p_evidence ->> 'expected_prior_catalog_sha256'
      is distinct from v_expected_prior_catalog_sha256
    or p_evidence ->> 'client_payload_sha256'
      is distinct from v_expected_client_payload_sha256
    or coalesce(p_evidence ->> 'upload_receipt_sha256', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released content block revision refused: checksum-bound evidence is incomplete.'
      using errcode = '22023';
  end if;
  if p_mutations is null
    or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) <> 44
  then
    raise exception 'Released content block revision refused: expected exactly 44 mutations.'
      using errcode = '22023';
  end if;
  if p_client_payload_sha256 is distinct from v_expected_client_payload_sha256 then
    raise exception 'Released content block revision refused: client payload checksum mismatch.'
      using errcode = '22023';
  end if;
  v_database_payload_sha256 :=
    encode(sha256(convert_to(p_mutations::text, 'UTF8')), 'hex');
  if v_database_payload_sha256 <> v_expected_database_payload_sha256 then
    raise exception 'Released content block revision refused: database payload checksum mismatch.'
      using errcode = '22023';
  end if;
  if p_confirmation is distinct from
    'REVISE-RELEASED-CONTENT-BLOCKS:' || p_import_id || ':'
      || p_expected_active_manifest_sha256 || ':' || p_manifest_sha256 || ':'
      || p_expected_catalog_sha256 || ':' || p_client_payload_sha256 || ':19:19:6'
  then
    raise exception 'Released content block revision refused: confirmation mismatch.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_mutations) mutation(value)
    where jsonb_typeof(mutation.value) <> 'object'
      or not mutation.value ?& v_required_keys
      or mutation.value - v_required_keys <> '{}'::jsonb
      or jsonb_typeof(mutation.value -> 'action') <> 'string'
      or mutation.value ->> 'action' not in ('update', 'insert')
      or jsonb_typeof(mutation.value -> 'source_key') <> 'string'
      or mutation.value ->> 'source_key' !~ '^block-[a-z0-9][a-z0-9-]{0,120}$'
      or jsonb_typeof(mutation.value -> 'block_id') <> 'string'
      or mutation.value ->> 'block_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
      or (mutation.value ->> 'block_id')::uuid <> all(v_expected_block_ids)
      or jsonb_typeof(mutation.value -> 'lesson_id') <> 'string'
      or mutation.value ->> 'lesson_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(mutation.value -> 'block_type') <> 'string'
      or mutation.value ->> 'block_type' not in ('download', 'flashcard', 'role_play')
      or jsonb_typeof(mutation.value -> 'replacement_content') <> 'object'
      or jsonb_typeof(mutation.value -> 'sort_order') <> 'number'
      or (mutation.value ->> 'sort_order')::numeric % 1 <> 0
      or (mutation.value ->> 'sort_order')::integer < 0
      or jsonb_typeof(mutation.value -> 'is_required_for_completion') <> 'boolean'
      or (
        mutation.value ->> 'action' = 'update'
        and jsonb_typeof(mutation.value -> 'expected_content') <> 'object'
      )
      or (
        mutation.value ->> 'action' = 'insert'
        and jsonb_typeof(mutation.value -> 'expected_content') <> 'null'
      )
  ) then
    raise exception 'Released content block revision refused: mutation row shape or exact target identity mismatch.'
      using errcode = '22023';
  end if;
  if (
    select count(distinct mutation.value ->> 'block_id')
    from jsonb_array_elements(p_mutations) mutation(value)
  ) <> 44 or (
    select count(distinct mutation.value ->> 'source_key')
    from jsonb_array_elements(p_mutations) mutation(value)
  ) <> 44 then
    raise exception 'Released content block revision refused: duplicate target identity.'
      using errcode = '22023';
  end if;

  select
    count(*) filter (
      where mutation.value ->> 'action' = 'update'
        and mutation.value ->> 'block_type' = 'download'
        and mutation.value ->> 'source_key' ~ '^block-guide-pdf-slot-(0[1-9]|1[0-9])$'
    ),
    count(*) filter (
      where mutation.value ->> 'action' = 'update'
        and mutation.value ->> 'block_type' = 'flashcard'
        and mutation.value ->> 'source_key' ~ '^block-flashcards-slot-(0[1-9]|1[0-9])$'
    ),
    count(*) filter (
      where mutation.value ->> 'action' = 'insert'
        and mutation.value ->> 'block_type' = 'role_play'
        and mutation.value ->> 'source_key' in (
          'block-role-play-guarded-inbound',
          'block-role-play-tired-landlord',
          'block-role-play-scam-suspicious-preforeclosure',
          'block-role-play-probate-follow-up',
          'block-role-play-family-dynamics-dayton',
          'block-role-play-full-cycle-capstone'
        )
    )
  into v_guide_update_count, v_flashcard_update_count, v_role_play_insert_count
  from jsonb_array_elements(p_mutations) mutation(value);
  if v_guide_update_count <> 19
    or v_flashcard_update_count <> 19
    or v_role_play_insert_count <> 6
  then
    raise exception 'Released content block revision refused: expected exact 19 guide, 19 flashcard, and 6 role-play scope.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_mutations) mutation(value)
    where mutation.value ->> 'block_type' = 'download'
      and (
        jsonb_typeof(mutation.value -> 'replacement_sha256') <> 'string'
        or mutation.value ->> 'replacement_sha256' !~ '^[0-9a-f]{64}$'
        or jsonb_typeof(mutation.value -> 'replacement_size_bytes') <> 'number'
        or (mutation.value ->> 'replacement_size_bytes')::numeric % 1 <> 0
        or (mutation.value ->> 'replacement_size_bytes')::bigint < 1
        or mutation.value -> 'replacement_content' ->> 'file_path' !~
          '^courses/bmh-employee-training/v1/guides/guide-slot-(0[1-9]|1[0-9])\.[0-9a-f]{64}\.pdf$'
        or mutation.value -> 'replacement_content' ->> 'file_path' not like
          '%.' || (mutation.value ->> 'replacement_sha256') || '.pdf'
        or (mutation.value -> 'replacement_content' ->> 'size_bytes')::bigint <>
          (mutation.value ->> 'replacement_size_bytes')::bigint
      )
  ) or exists (
    select 1
    from jsonb_array_elements(p_mutations) mutation(value)
    where mutation.value ->> 'block_type' <> 'download'
      and (
        jsonb_typeof(mutation.value -> 'replacement_sha256') <> 'null'
        or jsonb_typeof(mutation.value -> 'replacement_size_bytes') <> 'null'
      )
  ) then
    raise exception 'Released content block revision refused: immutable guide asset binding mismatch.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.content_import_released_content_block_revision_records,
    public.programs,
    public.courses,
    public.modules,
    public.lessons,
    public.content_blocks
  in share row exclusive mode;
  lock table storage.objects in share mode;

  select
    release.manifest_sha256,
    active.active_revision,
    active.active_manifest_sha256,
    active.active_catalog_sha256
  into
    v_release_manifest_sha256,
    v_active_revision,
    v_active_manifest_sha256,
    v_active_catalog_sha256
  from public.content_import_release_records release
  join public.content_import_active_release_v1 active on active.import_id = release.import_id
  where release.import_id = p_import_id;
  if not found
    or v_release_manifest_sha256 <> v_original_release_manifest_sha256
    or v_active_revision <> 2
    or v_active_manifest_sha256 <> v_expected_active_manifest_sha256
    or v_active_catalog_sha256 <>
      'ca42e3d6347a71f46bd1aabee6c7b5c9fc570e797473865ceee30d4fe2a36ae0'
    or not exists (
      select 1
      from public.programs program
      where program.content_import_id = p_import_id and program.is_published
    )
    or exists (
      select 1
      from public.courses course
      where course.content_import_id = p_import_id and not course.is_published
    )
  then
    raise exception 'Released content block revision refused: exact published release lineage was not found.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_mutations) mutation(value)
    where mutation.value ->> 'block_type' = 'download'
      and not exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'content'
          and object.name = mutation.value -> 'replacement_content' ->> 'file_path'
          and coalesce(
            to_jsonb(object) -> 'user_metadata' ->> 'sha256',
            object.metadata ->> 'sha256'
          ) = mutation.value ->> 'replacement_sha256'
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
          ) = (mutation.value ->> 'replacement_size_bytes')::bigint
          and starts_with(
            coalesce(object.metadata ->> 'mimetype', object.metadata ->> 'contentType', ''),
            'application/pdf'
          )
      )
  ) then
    raise exception 'Released content block revision refused: exact immutable guide asset is missing.'
      using errcode = '22023';
  end if;

  select * into v_record
  from public.content_import_released_content_block_revision_records record
  where record.import_id = p_import_id
    and record.manifest_sha256 = p_manifest_sha256;
  if found then
    v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
    select count(*) into v_target_count
    from jsonb_array_elements(p_mutations) mutation(value)
    join public.content_blocks block
      on block.id = (mutation.value ->> 'block_id')::uuid
     and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
     and block.block_type = mutation.value ->> 'block_type'
     and block.content = mutation.value -> 'replacement_content'
     and block.sort_order = (mutation.value ->> 'sort_order')::integer
     and block.is_required_for_completion =
       (mutation.value ->> 'is_required_for_completion')::boolean
    join public.lessons lesson on lesson.id = block.lesson_id
    join public.modules module on module.id = lesson.module_id
    join public.courses course on course.id = module.course_id
    where coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
    if v_record.database_payload_sha256 = v_database_payload_sha256
      and v_record.client_payload_sha256 = p_client_payload_sha256
      and v_record.prior_catalog_sha256 = p_expected_catalog_sha256
      and v_record.replacement_catalog_sha256 = v_replacement_catalog_sha256
      and v_target_count = 44
    then
      return jsonb_build_object(
        'status', 'already_revised',
        'import_id', p_import_id,
        'mutation_count', 44,
        'catalog_sha256', v_replacement_catalog_sha256
      );
    end if;
    raise exception 'Released content block revision retry refused: audit evidence or live target state drifted.'
      using errcode = '40001';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_prior_catalog_sha256 <> p_expected_catalog_sha256 then
    raise exception 'Released content block revision refused: catalog drifted from the exact production preflight.'
      using errcode = '40001';
  end if;

  with mutations as (
    select
      (mutation.value ->> 'block_id')::uuid as block_id,
      (mutation.value ->> 'lesson_id')::uuid as lesson_id,
      mutation.value ->> 'block_type' as block_type,
      mutation.value -> 'expected_content' as expected_content,
      mutation.value -> 'replacement_content' as replacement_content,
      (mutation.value ->> 'sort_order')::integer as sort_order,
      (mutation.value ->> 'is_required_for_completion')::boolean
        as is_required_for_completion
    from jsonb_array_elements(p_mutations) mutation(value)
    where mutation.value ->> 'action' = 'update'
  )
  update public.content_blocks block
  set content = mutations.replacement_content
  from mutations, public.lessons lesson, public.modules module, public.courses course
  where block.id = mutations.block_id
    and block.lesson_id = mutations.lesson_id
    and block.block_type = mutations.block_type
    and block.content = mutations.expected_content
    and block.sort_order = mutations.sort_order
    and block.is_required_for_completion = mutations.is_required_for_completion
    and lesson.id = block.lesson_id
    and module.id = lesson.module_id
    and course.id = module.course_id
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 38 then
    raise exception 'Released content block revision refused: expected update target, ownership, placement, type, or content mismatch.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.revise_content_blocks_import_id', p_import_id, true);
  perform set_config(
    'bmh.revise_content_blocks_payload_sha256',
    v_database_payload_sha256,
    true
  );
  insert into public.content_blocks (
    id,
    lesson_id,
    block_type,
    content,
    sort_order,
    is_required_for_completion
  )
  select
    (mutation.value ->> 'block_id')::uuid,
    (mutation.value ->> 'lesson_id')::uuid,
    mutation.value ->> 'block_type',
    mutation.value -> 'replacement_content',
    (mutation.value ->> 'sort_order')::integer,
    (mutation.value ->> 'is_required_for_completion')::boolean
  from jsonb_array_elements(p_mutations) mutation(value)
  join public.lessons lesson
    on lesson.id = (mutation.value ->> 'lesson_id')::uuid
  join public.modules module on module.id = lesson.module_id
  join public.courses course on course.id = module.course_id
  where mutation.value ->> 'action' = 'insert'
    and coalesce(lesson.content_import_id, course.content_import_id) = p_import_id;
  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> 6 then
    raise exception 'Released content block revision refused: expected role-play insertion ownership mismatch.'
      using errcode = '40001';
  end if;

  select count(*) into v_target_count
  from jsonb_array_elements(p_mutations) mutation(value)
  join public.content_blocks block
    on block.id = (mutation.value ->> 'block_id')::uuid
   and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
   and block.block_type = mutation.value ->> 'block_type'
   and block.content = mutation.value -> 'replacement_content'
   and block.sort_order = (mutation.value ->> 'sort_order')::integer
   and block.is_required_for_completion =
     (mutation.value ->> 'is_required_for_completion')::boolean;
  if v_target_count <> 44 then
    raise exception 'Released content block revision refused: atomic target verification failed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Released content block revision refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

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
    evidence,
    revised_by
  ) values (
    p_import_id,
    v_original_release_manifest_sha256,
    v_expected_active_manifest_sha256,
    p_manifest_sha256,
    v_prior_catalog_sha256,
    v_replacement_catalog_sha256,
    v_database_payload_sha256,
    p_client_payload_sha256,
    v_guide_update_count,
    v_flashcard_update_count,
    v_role_play_insert_count,
    p_mutations,
    p_evidence,
    auth.uid()
  );
  perform set_config('bmh.revise_content_blocks_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'revised',
    'import_id', p_import_id,
    'mutation_count', v_updated_count + v_inserted_count,
    'guide_update_count', v_guide_update_count,
    'flashcard_update_count', v_flashcard_update_count,
    'role_play_insert_count', v_role_play_insert_count,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256
  );
end;
$$;

revoke all on function public.fn_revise_released_content_blocks_v1(
  text, text, text, text, jsonb, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_revise_released_content_blocks_v1(
  text, text, text, text, jsonb, text, jsonb, text
) to service_role;
