-- Reusable, versioned successor to the one-shot 20260726170000 content-block
-- correction. That migration hard-pinned an exact 44-row payload (44 UUIDs,
-- a fixed 19/19/6 breakdown, one literal database-payload checksum baked into
-- the insert-guard trigger) and cannot be reused for a different set of
-- blocks. This migration adds a `revision integer` compare-and-swap ledger
-- for content-block corrections, modeled on 20260722130000's versioned quiz
-- revision pattern, so any number of future publishes (a 3-block pilot, a
-- larger rollout, ...) can reuse the same mechanism.
--
-- Design notes:
--  * This ledger is intentionally independent of
--    content_import_release_revisions (the quiz-revision ledger). The real
--    safety gate for either mechanism is a fresh whole-catalog SHA-256
--    compare-and-swap via fn_course_import_catalog_sha256, which always
--    reflects live state regardless of which mechanism moved it last. Coupling
--    the two ledgers together would only reproduce the one-shot migration's
--    hard-pin problem in a different shape (an exact "must be revision N"
--    requirement tied to unrelated quiz-revision history).
--  * Every check in fn_revise_released_content_blocks_v2 is parametric: no
--    hardcoded manifest/catalog SHAs, block IDs, or mutation counts. The
--    caller supplies its own preflight checksums and the function verifies
--    them against live state.

set lock_timeout = '10s';

create table public.content_import_content_block_revisions (
  import_id text not null references public.content_import_release_records(import_id) on delete restrict,
  revision integer not null check (revision > 1),
  prior_manifest_sha256 text not null check (prior_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  prior_catalog_sha256 text not null check (prior_catalog_sha256 ~ '^[0-9a-f]{64}$'),
  catalog_sha256 text not null check (catalog_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  client_payload_sha256 text not null check (client_payload_sha256 ~ '^[0-9a-f]{64}$'),
  mutation_count integer not null check (mutation_count > 0),
  update_count integer not null check (update_count >= 0),
  insert_count integer not null check (insert_count >= 0),
  mutations jsonb not null check (jsonb_typeof(mutations) = 'array'),
  prior_block_graph jsonb not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  revised_at timestamptz not null default now(),
  revised_by uuid,
  primary key (import_id, revision),
  check (update_count + insert_count = mutation_count)
);

comment on table public.content_import_content_block_revisions is
  'Versioned, append-only audit ledger for reusable content-block corrections layered over an immutable imported-catalog release. Independent of the quiz-revision ledger; gated on a live whole-catalog checksum compare-and-swap, not on cross-domain revision numbering.';

alter table public.content_import_content_block_revisions enable row level security;
revoke all on table public.content_import_content_block_revisions
  from public, anon, authenticated;
grant select on table public.content_import_content_block_revisions to service_role;

create or replace function public.fn_guard_content_import_content_block_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT'
    or coalesce(auth.role(), '') <> 'service_role'
    or coalesce(current_setting('bmh.revise_content_blocks_v2_import_id', true), '') <> new.import_id
    or coalesce(current_setting('bmh.revise_content_blocks_v2_payload_sha256', true), '') <> new.payload_sha256
  then
    raise exception 'Content block revision records are immutable and operation-bound.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_content_import_content_block_revision()
  from public, anon, authenticated;

create trigger content_import_content_block_revisions_guard
before insert or update or delete on public.content_import_content_block_revisions
for each row execute function public.fn_guard_content_import_content_block_revision();

create or replace view public.content_import_active_content_block_revision_v1
with (security_invoker = true)
as
select
  release.import_id,
  release.program_id,
  release.manifest_sha256 as original_manifest_sha256,
  release.catalog_sha256 as original_catalog_sha256,
  coalesce(revision.revision, 1) as active_revision,
  coalesce(revision.manifest_sha256, release.manifest_sha256) as active_manifest_sha256,
  coalesce(revision.catalog_sha256, release.catalog_sha256) as active_catalog_sha256,
  coalesce(revision.revised_at, release.released_at) as active_revised_at
from public.content_import_release_records release
left join lateral (
  select item.revision, item.manifest_sha256, item.catalog_sha256, item.revised_at
  from public.content_import_content_block_revisions item
  where item.import_id = release.import_id
  order by item.revision desc
  limit 1
) revision on true;

revoke all on public.content_import_active_content_block_revision_v1
  from public, anon, authenticated;
grant select on public.content_import_active_content_block_revision_v1 to service_role;

-- Generalize the content_blocks insert guard. Preserve migration 033's base
-- apply-path branch and migration 20260726170000's exact one-shot branch
-- verbatim (nothing in this migration retires history or existing tests);
-- add one new branch bound to this versioned mechanism's own session markers
-- instead of a hardcoded payload hash, since a v2 payload is never a fixed
-- shape.
create or replace function public.fn_guard_imported_content_block_insert_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id text;
  v_program_id uuid;
  v_course_published boolean;
  v_program_published boolean;
  v_apply_import_id text :=
    coalesce(current_setting('bmh.apply_import_id', true), '');
  v_revision_v1_import_id text :=
    coalesce(current_setting('bmh.revise_content_blocks_import_id', true), '');
  v_revision_v1_payload_sha256 text :=
    coalesce(current_setting('bmh.revise_content_blocks_payload_sha256', true), '');
  v_revision_v2_import_id text :=
    coalesce(current_setting('bmh.revise_content_blocks_v2_import_id', true), '');
  v_revision_v2_payload_sha256 text :=
    coalesce(current_setting('bmh.revise_content_blocks_v2_payload_sha256', true), '');
begin
  select
    coalesce(lesson.content_import_id, course.content_import_id),
    course.is_published,
    program.is_published,
    program.id
  into v_import_id, v_course_published, v_program_published, v_program_id
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
    and v_revision_v1_import_id = v_import_id
    and v_revision_v1_payload_sha256 =
      '68508b6a1b85c493d1d39ba80d3d661fcf05fa6a86ecf6df8257e42466fded3a'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.program_id = v_program_id
        and release.manifest_sha256 =
          '71f85173bc857d1b3b042fba0a50fdd420b6410ef84b104a751c3ed5982eba5c'
    )
  then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role'
    and v_revision_v2_import_id = v_import_id
    and v_revision_v2_payload_sha256 ~ '^[0-9a-f]{64}$'
    and v_course_published
    and v_program_published
    and exists (
      select 1
      from public.content_import_release_records release
      where release.import_id = v_import_id
        and release.program_id = v_program_id
    )
  then
    return new;
  end if;
  raise exception 'Imported content blocks may only be created by the exact apply or released content revision operation.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_imported_content_block_insert_v2()
  from public, anon, authenticated;

drop trigger if exists guard_imported_catalog_insert on public.content_blocks;
create trigger guard_imported_catalog_insert
before insert on public.content_blocks
for each row execute function public.fn_guard_imported_content_block_insert_v2();

create or replace function public.fn_revise_released_content_blocks_v2(
  p_import_id text,
  p_expected_prior_manifest_sha256 text,
  p_manifest_sha256 text,
  p_expected_prior_catalog_sha256 text,
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
  v_allowed_block_types constant text[] := array[
    'video','text','pdf','image','audio','download',
    'external_link','embed','role_play','divider','callout'
  ];
  v_program_id uuid;
  v_active_revision integer;
  v_active_manifest_sha256 text;
  v_active_catalog_sha256 text;
  v_active_evidence jsonb;
  v_database_payload_sha256 text;
  v_prior_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_update_count integer;
  v_insert_count integer;
  v_mutation_count integer;
  v_updated_count integer;
  v_inserted_count integer;
  v_target_count integer;
  v_prior_block_graph jsonb;
  v_existing public.content_import_content_block_revisions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released content block revision requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'Released content block revision refused: invalid import_id.'
      using errcode = '22023';
  end if;
  if p_expected_prior_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_prior_catalog_sha256 !~ '^[0-9a-f]{64}$'
    or p_client_payload_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released content block revision refused: invalid checksum shape.'
      using errcode = '22023';
  end if;
  if p_mutations is null
    or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) < 1
    or jsonb_array_length(p_mutations) > 500
  then
    raise exception 'Released content block revision refused: mutations must be a non-empty array of at most 500 rows.'
      using errcode = '22023';
  end if;
  v_mutation_count := jsonb_array_length(p_mutations);

  if jsonb_typeof(p_evidence) is distinct from 'object'
    or not (p_evidence ?& array[
      'operation', 'manifest_sha256', 'expected_prior_catalog_sha256',
      'client_payload_sha256', 'upload_receipt_sha256'
    ])
    or p_evidence ->> 'operation' <> 'released_content_blocks_v2'
    or p_evidence ->> 'manifest_sha256' is distinct from p_manifest_sha256
    or p_evidence ->> 'expected_prior_catalog_sha256'
      is distinct from p_expected_prior_catalog_sha256
    or p_evidence ->> 'client_payload_sha256' is distinct from p_client_payload_sha256
    or coalesce(p_evidence ->> 'upload_receipt_sha256', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released content block revision refused: checksum-bound evidence is incomplete.'
      using errcode = '22023';
  end if;

  if p_confirmation is distinct from
    'REVISE-RELEASED-CONTENT-BLOCKS-V2:' || p_import_id || ':'
      || p_expected_prior_manifest_sha256 || ':' || p_manifest_sha256 || ':'
      || p_expected_prior_catalog_sha256 || ':' || p_client_payload_sha256 || ':'
      || v_mutation_count::text
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
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(mutation.value -> 'lesson_id') <> 'string'
      or mutation.value ->> 'lesson_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(mutation.value -> 'block_type') <> 'string'
      or not (mutation.value ->> 'block_type' = any(v_allowed_block_types))
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
      or (
        mutation.value ->> 'block_type' = 'download'
        and (
          jsonb_typeof(mutation.value -> 'replacement_sha256') <> 'string'
          or mutation.value ->> 'replacement_sha256' !~ '^[0-9a-f]{64}$'
          or jsonb_typeof(mutation.value -> 'replacement_size_bytes') <> 'number'
          or (mutation.value ->> 'replacement_size_bytes')::numeric % 1 <> 0
          or (mutation.value ->> 'replacement_size_bytes')::bigint < 1
          or mutation.value -> 'replacement_content' ->> 'file_path' !~
            ('\.' || (mutation.value ->> 'replacement_sha256') || '\.[a-z0-9]{1,16}$')
        )
      )
      or (
        mutation.value ->> 'block_type' <> 'download'
        and (
          jsonb_typeof(mutation.value -> 'replacement_sha256') <> 'null'
          or jsonb_typeof(mutation.value -> 'replacement_size_bytes') <> 'null'
        )
      )
  ) then
    raise exception 'Released content block revision refused: mutation row shape mismatch.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct mutation.value ->> 'block_id')
    from jsonb_array_elements(p_mutations) mutation(value)
  ) <> v_mutation_count or (
    select count(distinct mutation.value ->> 'source_key')
    from jsonb_array_elements(p_mutations) mutation(value)
  ) <> v_mutation_count then
    raise exception 'Released content block revision refused: duplicate target identity.'
      using errcode = '22023';
  end if;

  select
    count(*) filter (where mutation.value ->> 'action' = 'update'),
    count(*) filter (where mutation.value ->> 'action' = 'insert')
  into v_update_count, v_insert_count
  from jsonb_array_elements(p_mutations) mutation(value);

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_release_revisions,
    public.content_import_content_block_revisions,
    public.programs,
    public.courses,
    public.modules,
    public.lessons,
    public.content_blocks
  in share row exclusive mode;
  lock table storage.objects in share mode;

  select active.program_id, active.active_revision,
    active.active_manifest_sha256, active.active_catalog_sha256
  into v_program_id, v_active_revision, v_active_manifest_sha256, v_active_catalog_sha256
  from public.content_import_active_content_block_revision_v1 active
  where active.import_id = p_import_id;
  if not found
    or not exists (
      select 1 from public.programs program
      where program.id = v_program_id and program.is_published
    )
    or exists (
      select 1
      from public.program_courses link
      join public.courses course on course.id = link.course_id
      where link.program_id = v_program_id and not course.is_published
    )
  then
    raise exception 'Released content block revision refused: exact published release lineage was not found.'
      using errcode = '42501';
  end if;

  if v_active_revision > 1 then
    select evidence into v_active_evidence
    from public.content_import_content_block_revisions
    where import_id = p_import_id and revision = v_active_revision;
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
      )
  ) then
    raise exception 'Released content block revision refused: an immutable download asset referenced by the payload is missing.'
      using errcode = '22023';
  end if;

  -- Idempotent replay: the exact target manifest is already the active one.
  if v_active_manifest_sha256 = p_manifest_sha256 then
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
       (mutation.value ->> 'is_required_for_completion')::boolean;
    if v_active_revision > 1
      and v_active_evidence ->> 'client_payload_sha256' = p_client_payload_sha256
      and v_active_catalog_sha256 = v_replacement_catalog_sha256
      and v_target_count = v_mutation_count
    then
      return jsonb_build_object(
        'status', 'already_revised',
        'import_id', p_import_id,
        'revision', v_active_revision,
        'mutation_count', v_mutation_count,
        'catalog_sha256', v_replacement_catalog_sha256
      );
    end if;
    raise exception 'Released content block revision retry refused: audit evidence or live target state drifted.'
      using errcode = '40001';
  end if;
  if v_active_manifest_sha256 <> p_expected_prior_manifest_sha256 then
    raise exception 'Released content block revision refused: active manifest changed after preflight.'
      using errcode = '40001';
  end if;

  v_prior_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_prior_catalog_sha256 <> p_expected_prior_catalog_sha256 then
    raise exception 'Released content block revision refused: catalog drifted from the exact preflight checksum.'
      using errcode = '40001';
  end if;
  -- The original release's pinned catalog_sha256 reflects the catalog just
  -- before the release's own publish flip (fn_release_course_import_v1
  -- computes it, THEN publishes), so it can never match a live post-publish
  -- checksum. Only compare against the active-state view's cached checksum
  -- once a prior v2 revision has itself recorded a live, post-publish
  -- checksum -- exactly the same asymmetry the quiz-revision pattern uses.
  if v_active_revision > 1 and v_prior_catalog_sha256 <> v_active_catalog_sha256 then
    raise exception 'Released content block revision refused: live catalog changed after the active revision receipt.'
      using errcode = '40001';
  end if;

  select jsonb_build_object(
    'updated_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', block.id, 'lesson_id', block.lesson_id,
        'block_type', block.block_type, 'content', block.content,
        'sort_order', block.sort_order,
        'is_required_for_completion', block.is_required_for_completion
      ) order by block.id)
      from jsonb_array_elements(p_mutations) mutation(value)
      join public.content_blocks block
        on block.id = (mutation.value ->> 'block_id')::uuid
      where mutation.value ->> 'action' = 'update'
    ), '[]'::jsonb),
    'inserted_block_ids', coalesce((
      select jsonb_agg(mutation.value ->> 'block_id')
      from jsonb_array_elements(p_mutations) mutation(value)
      where mutation.value ->> 'action' = 'insert'
    ), '[]'::jsonb)
  ) into v_prior_block_graph;

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
  if v_updated_count <> v_update_count then
    raise exception 'Released content block revision refused: expected update target, ownership, placement, type, or content mismatch.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.revise_content_blocks_v2_import_id', p_import_id, true);
  v_database_payload_sha256 :=
    encode(sha256(convert_to(p_mutations::text, 'UTF8')), 'hex');
  perform set_config(
    'bmh.revise_content_blocks_v2_payload_sha256',
    v_database_payload_sha256,
    true
  );
  insert into public.content_blocks (
    id, lesson_id, block_type, content, sort_order, is_required_for_completion
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
  if v_inserted_count <> v_insert_count then
    raise exception 'Released content block revision refused: expected insertion ownership mismatch.'
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
  if v_target_count <> v_mutation_count then
    raise exception 'Released content block revision refused: atomic target verification failed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_replacement_catalog_sha256 = v_prior_catalog_sha256 then
    raise exception 'Released content block revision refused: catalog checksum did not advance.'
      using errcode = '40001';
  end if;

  insert into public.content_import_content_block_revisions (
    import_id, revision, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256, client_payload_sha256,
    mutation_count, update_count, insert_count,
    mutations, prior_block_graph, evidence, revised_by
  ) values (
    p_import_id, v_active_revision + 1,
    p_expected_prior_manifest_sha256, p_manifest_sha256,
    v_prior_catalog_sha256, v_replacement_catalog_sha256,
    v_database_payload_sha256, p_client_payload_sha256,
    v_mutation_count, v_update_count, v_insert_count,
    p_mutations, v_prior_block_graph, p_evidence, auth.uid()
  );
  perform set_config('bmh.revise_content_blocks_v2_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_v2_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'revised',
    'import_id', p_import_id,
    'revision', v_active_revision + 1,
    'mutation_count', v_mutation_count,
    'update_count', v_update_count,
    'insert_count', v_insert_count,
    'prior_catalog_sha256', v_prior_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256
  );
end;
$$;

revoke all on function public.fn_revise_released_content_blocks_v2(
  text, text, text, text, jsonb, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_revise_released_content_blocks_v2(
  text, text, text, text, jsonb, text, jsonb, text
) to service_role;

comment on function public.fn_revise_released_content_blocks_v2(
  text, text, text, text, jsonb, text, jsonb, text
) is 'Reusable, versioned content-block revision over an immutable imported-catalog release: compare-and-swaps the whole-catalog checksum, applies a variable-count insert/update mutation payload, and records an append-only, rollback-capable audit row.';

create or replace function public.fn_rollback_released_content_block_revision_v1(
  p_import_id text,
  p_expected_revision integer,
  p_evidence jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest public.content_import_content_block_revisions%rowtype;
  v_current_catalog_sha256 text;
  v_replacement_catalog_sha256 text;
  v_updated_rows jsonb;
  v_inserted_block_ids jsonb;
  v_restored_count integer;
  v_deleted_count integer;
  v_target_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Released content block revision rollback requires service_role.'
      using errcode = '42501';
  end if;
  if p_import_id is null or p_import_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_expected_revision is null or p_expected_revision < 2
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence ->> 'operation' <> 'rollback'
    or p_evidence ->> 'rollback_sha256' !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Released content block revision rollback refused: invalid rollback evidence.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('course-import-catalog-mutation', 0));
  perform pg_advisory_xact_lock(hashtextextended('course-import-release:' || p_import_id, 0));
  lock table
    public.content_import_release_records,
    public.content_import_content_block_revisions,
    public.programs, public.courses, public.modules, public.lessons,
    public.content_blocks, public.role_play_results
  in share row exclusive mode;

  select * into v_latest
  from public.content_import_content_block_revisions revision
  where revision.import_id = p_import_id
  order by revision.revision desc
  limit 1;
  if not found or v_latest.revision <> p_expected_revision then
    raise exception 'Released content block revision rollback refused: active revision changed after preflight.'
      using errcode = '40001';
  end if;
  if p_confirmation is distinct from
    'ROLLBACK-RELEASED-CONTENT-BLOCKS-V2:' || p_import_id || ':'
      || p_expected_revision::text || ':' || v_latest.manifest_sha256 || ':'
      || v_latest.prior_manifest_sha256 || ':' || (p_evidence ->> 'rollback_sha256')
  then
    raise exception 'Released content block revision rollback refused: confirmation mismatch.'
      using errcode = '22023';
  end if;

  v_current_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_current_catalog_sha256 <> v_latest.catalog_sha256 then
    raise exception 'Released content block revision rollback refused: catalog changed after the recorded revision.'
      using errcode = '40001';
  end if;

  v_updated_rows := v_latest.prior_block_graph -> 'updated_rows';
  v_inserted_block_ids := v_latest.prior_block_graph -> 'inserted_block_ids';
  if jsonb_typeof(v_updated_rows) is distinct from 'array'
    or jsonb_typeof(v_inserted_block_ids) is distinct from 'array'
  then
    raise exception 'Released content block revision rollback refused: archived prior graph is malformed.';
  end if;

  -- Refuse rollback if a learner has already completed a role-play attempt
  -- against any block this revision touched — matches the quiz-revision
  -- rollback's "no completed activity" safety property, scoped to the
  -- durable evidence table content blocks actually have.
  if exists (
    select 1
    from public.role_play_results result
    where result.block_id in (
      select (mutation.value ->> 'block_id')::uuid
      from jsonb_array_elements(v_latest.mutations) mutation(value)
    )
  ) then
    raise exception 'Released content block revision rollback refused: completed learner activity exists on a touched block.'
      using errcode = '23503';
  end if;

  -- Verify every mutated row still holds exactly the replacement state this
  -- revision produced (no further drift since forward application).
  select count(*) into v_target_count
  from jsonb_array_elements(v_latest.mutations) mutation(value)
  join public.content_blocks block
    on block.id = (mutation.value ->> 'block_id')::uuid
   and block.lesson_id = (mutation.value ->> 'lesson_id')::uuid
   and block.block_type = mutation.value ->> 'block_type'
   and block.content = mutation.value -> 'replacement_content'
   and block.sort_order = (mutation.value ->> 'sort_order')::integer
   and block.is_required_for_completion =
     (mutation.value ->> 'is_required_for_completion')::boolean;
  if v_target_count <> v_latest.mutation_count then
    raise exception 'Released content block revision rollback refused: live state no longer matches the recorded forward revision.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.rollback_import_id', p_import_id, true);
  delete from public.content_blocks block
  where block.id in (
    select value::uuid from jsonb_array_elements_text(v_inserted_block_ids) value
  );
  get diagnostics v_deleted_count = row_count;
  perform set_config('bmh.rollback_import_id', '', true);
  if v_deleted_count <> jsonb_array_length(v_inserted_block_ids) then
    raise exception 'Released content block revision rollback refused: expected insertion rows were missing or already changed.'
      using errcode = '40001';
  end if;

  update public.content_blocks block
  set
    content = row.content,
    sort_order = row.sort_order,
    is_required_for_completion = row.is_required_for_completion
  from jsonb_to_recordset(v_updated_rows) as row(
    id uuid, lesson_id uuid, block_type text, content jsonb,
    sort_order integer, is_required_for_completion boolean
  )
  where block.id = row.id and block.lesson_id = row.lesson_id;
  get diagnostics v_restored_count = row_count;
  if v_restored_count <> jsonb_array_length(v_updated_rows) then
    raise exception 'Released content block revision rollback refused: expected update rows were missing or already changed.'
      using errcode = '40001';
  end if;

  v_replacement_catalog_sha256 := public.fn_course_import_catalog_sha256(p_import_id);
  if v_replacement_catalog_sha256 <> v_latest.prior_catalog_sha256 then
    raise exception 'Released content block revision rollback failed to restore the exact prior catalog checksum.'
      using errcode = '40001';
  end if;

  perform set_config('bmh.revise_content_blocks_v2_import_id', p_import_id, true);
  perform set_config(
    'bmh.revise_content_blocks_v2_payload_sha256',
    encode(sha256(convert_to(v_latest.mutations::text, 'UTF8')), 'hex'),
    true
  );
  insert into public.content_import_content_block_revisions (
    import_id, revision, prior_manifest_sha256, manifest_sha256,
    prior_catalog_sha256, catalog_sha256, payload_sha256, client_payload_sha256,
    mutation_count, update_count, insert_count,
    mutations, prior_block_graph, evidence, revised_by
  ) values (
    p_import_id, v_latest.revision + 1,
    v_latest.manifest_sha256, v_latest.prior_manifest_sha256,
    v_current_catalog_sha256, v_replacement_catalog_sha256,
    encode(sha256(convert_to(v_latest.mutations::text, 'UTF8')), 'hex'),
    v_latest.client_payload_sha256,
    v_latest.mutation_count, v_latest.update_count, v_latest.insert_count,
    v_latest.mutations, v_latest.prior_block_graph, p_evidence, auth.uid()
  );
  perform set_config('bmh.revise_content_blocks_v2_import_id', '', true);
  perform set_config('bmh.revise_content_blocks_v2_payload_sha256', '', true);

  return jsonb_build_object(
    'status', 'rolled_back',
    'import_id', p_import_id,
    'revision', v_latest.revision + 1,
    'prior_catalog_sha256', v_current_catalog_sha256,
    'catalog_sha256', v_replacement_catalog_sha256,
    'restored_updates', v_restored_count,
    'reverted_inserts', v_deleted_count
  );
end;
$$;

revoke all on function public.fn_rollback_released_content_block_revision_v1(
  text, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.fn_rollback_released_content_block_revision_v1(
  text, integer, jsonb, text
) to service_role;

comment on function public.fn_rollback_released_content_block_revision_v1(
  text, integer, jsonb, text
) is 'Reverts the most recent versioned content-block revision by restoring updated rows to their archived pre-image and deleting inserted rows, refusing if completed learner activity or further drift exists.';
