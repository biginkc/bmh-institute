-- Bind private catalog artwork to the import that owns its storage namespace.
-- Manual catalog records keep NULL and use their record-ID scoped namespace.

alter table public.programs
  add column if not exists content_import_id text;
alter table public.courses
  add column if not exists content_import_id text;
alter table public.lessons
  add column if not exists content_import_id text;

alter table public.programs
  drop constraint if exists programs_content_import_id_format;
alter table public.programs
  add constraint programs_content_import_id_format
  check (content_import_id is null or content_import_id ~ '^[a-z0-9][a-z0-9._-]*$');

alter table public.courses
  drop constraint if exists courses_content_import_id_format;
alter table public.courses
  add constraint courses_content_import_id_format
  check (content_import_id is null or content_import_id ~ '^[a-z0-9][a-z0-9._-]*$');

alter table public.lessons
  drop constraint if exists lessons_content_import_id_format;
alter table public.lessons
  add constraint lessons_content_import_id_format
  check (content_import_id is null or content_import_id ~ '^[a-z0-9][a-z0-9._-]*$');

comment on column public.programs.content_import_id is
  'Immutable import provenance used to authorize the private artwork namespace.';
comment on column public.courses.content_import_id is
  'Immutable import provenance used to authorize the private artwork namespace.';
comment on column public.lessons.content_import_id is
  'Immutable import provenance used to authorize the private artwork namespace.';

create or replace function public.fn_preserve_catalog_content_import_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.content_import_id is distinct from old.content_import_id then
    raise exception 'catalog content_import_id is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_preserve_catalog_content_import_id() from public, anon, authenticated;

drop trigger if exists programs_preserve_content_import_id on public.programs;
create trigger programs_preserve_content_import_id
before update of content_import_id on public.programs
for each row execute function public.fn_preserve_catalog_content_import_id();

drop trigger if exists courses_preserve_content_import_id on public.courses;
create trigger courses_preserve_content_import_id
before update of content_import_id on public.courses
for each row execute function public.fn_preserve_catalog_content_import_id();

drop trigger if exists lessons_preserve_content_import_id on public.lessons;
create trigger lessons_preserve_content_import_id
before update of content_import_id on public.lessons
for each row execute function public.fn_preserve_catalog_content_import_id();
