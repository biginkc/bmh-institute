-- Bind private catalog artwork to one exact, approved import asset.
-- Manual catalog rows keep every provenance column NULL and use their
-- record-ID-scoped storage namespace.

alter table public.programs
  add column if not exists content_import_id text,
  add column if not exists thumbnail_asset_key text,
  add column if not exists thumbnail_approved_path text,
  add column if not exists thumbnail_approved_sha256 text;
alter table public.courses
  add column if not exists content_import_id text,
  add column if not exists thumbnail_asset_key text,
  add column if not exists thumbnail_approved_path text,
  add column if not exists thumbnail_approved_sha256 text;
alter table public.lessons
  add column if not exists content_import_id text,
  add column if not exists thumbnail_asset_key text,
  add column if not exists thumbnail_approved_path text,
  add column if not exists thumbnail_approved_sha256 text;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['programs', 'courses', 'lessons'] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_content_import_id_format');
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_thumbnail_asset_key_format');
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_thumbnail_approved_sha256_format');
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_artwork_provenance_state');
    execute format(
      'alter table public.%I add constraint %I check (content_import_id is null or content_import_id ~ ''^[a-z0-9][a-z0-9._-]*$'')',
      table_name,
      table_name || '_content_import_id_format'
    );
    execute format(
      'alter table public.%I add constraint %I check (thumbnail_asset_key is null or thumbnail_asset_key ~ ''^[a-z0-9][a-z0-9._-]*$'')',
      table_name,
      table_name || '_thumbnail_asset_key_format'
    );
    execute format(
      'alter table public.%I add constraint %I check (thumbnail_approved_sha256 is null or thumbnail_approved_sha256 ~ ''^[a-f0-9]{64}$'')',
      table_name,
      table_name || '_thumbnail_approved_sha256_format'
    );
    execute format(
      'alter table public.%I add constraint %I check (
        (content_import_id is null and thumbnail_asset_key is null and thumbnail_approved_path is null and thumbnail_approved_sha256 is null)
        or
        (content_import_id is not null and (
          (thumbnail_path is null and thumbnail_asset_key is null and thumbnail_approved_path is null and thumbnail_approved_sha256 is null)
          or
          (thumbnail_path is not null
            and thumbnail_path = thumbnail_approved_path
            and thumbnail_asset_key is not null
            and thumbnail_approved_sha256 is not null
            and position(thumbnail_approved_sha256 in thumbnail_approved_path) > 0
            and thumbnail_approved_path not like ''/%%''
            and thumbnail_approved_path not like ''%%..%%''
            and thumbnail_approved_path not like ''%%://%%'')
        ))
      )',
      table_name,
      table_name || '_artwork_provenance_state'
    );
  end loop;
end;
$$;

comment on column public.programs.content_import_id is 'Immutable import provenance for this catalog row.';
comment on column public.courses.content_import_id is 'Immutable import provenance for this catalog row.';
comment on column public.lessons.content_import_id is 'Immutable import provenance for this catalog row.';
comment on column public.programs.thumbnail_approved_path is 'Exact approved import artwork path bound to this program.';
comment on column public.courses.thumbnail_approved_path is 'Exact approved import artwork path bound to this course.';
comment on column public.lessons.thumbnail_approved_path is 'Exact approved import artwork path bound to this lesson.';

create or replace function public.fn_guard_catalog_artwork_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.content_import_id is not null and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'only the service role may create imported catalog provenance';
    end if;
    return new;
  end if;

  -- One safe upgrade path for rows imported before provenance existed. The
  -- service-role importer may claim the row once; every later change is denied.
  if old.content_import_id is null and new.content_import_id is not null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'only the service role may claim catalog import provenance';
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
    raise exception 'imported catalog artwork provenance is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_guard_catalog_artwork_provenance() from public, anon, authenticated;

drop trigger if exists programs_preserve_content_import_id on public.programs;
drop trigger if exists courses_preserve_content_import_id on public.courses;
drop trigger if exists lessons_preserve_content_import_id on public.lessons;
drop function if exists public.fn_preserve_catalog_content_import_id();

drop trigger if exists programs_guard_artwork_provenance on public.programs;
create trigger programs_guard_artwork_provenance
before insert or update of content_import_id, thumbnail_asset_key, thumbnail_approved_path, thumbnail_approved_sha256, thumbnail_path
on public.programs for each row execute function public.fn_guard_catalog_artwork_provenance();

drop trigger if exists courses_guard_artwork_provenance on public.courses;
create trigger courses_guard_artwork_provenance
before insert or update of content_import_id, thumbnail_asset_key, thumbnail_approved_path, thumbnail_approved_sha256, thumbnail_path
on public.courses for each row execute function public.fn_guard_catalog_artwork_provenance();

drop trigger if exists lessons_guard_artwork_provenance on public.lessons;
create trigger lessons_guard_artwork_provenance
before insert or update of content_import_id, thumbnail_asset_key, thumbnail_approved_path, thumbnail_approved_sha256, thumbnail_path
on public.lessons for each row execute function public.fn_guard_catalog_artwork_provenance();

-- Assignment ownership verification and update happen in one SQL statement so
-- the lesson link cannot change between a preflight read and the write.
create or replace function public.fn_update_assignment_for_lesson(
  p_lesson_id uuid,
  p_assignment_id uuid,
  p_title text,
  p_instructions text,
  p_submission_type text,
  p_requires_review boolean,
  p_rubric jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'admin role required';
  end if;
  if p_title is null or length(btrim(p_title)) < 1 or length(btrim(p_title)) > 200 then
    raise exception 'invalid assignment title';
  end if;
  if p_instructions is null or length(btrim(p_instructions)) < 1 or length(btrim(p_instructions)) > 10000 then
    raise exception 'invalid assignment instructions';
  end if;
  if p_submission_type is null or p_submission_type not in ('file_upload', 'text', 'url') then
    raise exception 'invalid assignment submission type';
  end if;
  if p_requires_review is null then
    raise exception 'invalid assignment review setting';
  end if;
  if p_rubric is null or jsonb_typeof(p_rubric) <> 'array' or jsonb_array_length(p_rubric) > 20 then
    raise exception 'invalid assignment rubric';
  end if;
  if p_requires_review and jsonb_array_length(p_rubric) = 0 then
    raise exception 'reviewed assignments require a rubric';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rubric) as item
    where jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'criterion') <> 'string'
      or jsonb_typeof(item -> 'description') <> 'string'
      or length(btrim(item ->> 'criterion')) < 1
      or length(btrim(item ->> 'criterion')) > 120
      or length(btrim(item ->> 'description')) < 1
      or length(btrim(item ->> 'description')) > 1000
  ) then
    raise exception 'invalid assignment rubric';
  end if;

  update public.assignments as assignment
  set title = btrim(p_title),
      instructions = btrim(p_instructions),
      submission_type = p_submission_type,
      requires_review = p_requires_review,
      rubric = p_rubric
  where assignment.id = p_assignment_id
    and exists (
      select 1
      from public.lessons as lesson
      where lesson.id = p_lesson_id
        and lesson.lesson_type = 'assignment'
        and lesson.assignment_id = assignment.id
    );
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.fn_update_assignment_for_lesson(uuid, uuid, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.fn_update_assignment_for_lesson(uuid, uuid, text, text, text, boolean, jsonb) to authenticated, service_role;
