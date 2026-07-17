-- The importer uses INSERT ... ON CONFLICT for idempotent reruns. PostgreSQL
-- executes BEFORE INSERT triggers before conflict resolution, so permit only an
-- exact service-role replay of the already-recorded QA access row.

create or replace function public.fn_guard_unreleased_import_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_program_id uuid := case when tg_op = 'DELETE' then old.program_id else new.program_id end;
  v_import_id text;
  v_published boolean;
  v_old_import_id text;
  v_old_published boolean;
begin
  if tg_op = 'UPDATE' then
    select program.content_import_id, program.is_published
      into v_old_import_id, v_old_published
    from public.programs program
    where program.id = old.program_id;

    if v_old_import_id is not null and not v_old_published
       and (new.program_id is distinct from old.program_id
         or new.role_group_id is distinct from old.role_group_id) then
      raise exception 'Unreleased imported catalog QA access may not be moved or replaced.'
        using errcode = '42501';
    end if;
  end if;

  select program.content_import_id, program.is_published
    into v_import_id, v_published
  from public.programs program
  where program.id = v_program_id;

  if v_import_id is null or v_published then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Unreleased imported catalog QA access may only be changed by the import service.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.program_id is not distinct from old.program_id
     and new.role_group_id is not distinct from old.role_group_id then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role'
     and coalesce(current_setting('bmh.release_import_id', true), '') = v_import_id
     and exists (
       select 1
       from public.content_import_release_records release
       where release.import_id = v_import_id
         and release.employee_role_group_id = new.role_group_id
     ) then
    return new;
  end if;

  if tg_op = 'INSERT'
     and coalesce(auth.role(), '') = 'service_role'
     and exists (
       select 1
       from public.program_access access
       where access.id = new.id
         and access.program_id = new.program_id
         and access.role_group_id = new.role_group_id
     ) then
    return new;
  end if;

  if tg_op = 'INSERT'
     and coalesce(auth.role(), '') = 'service_role'
     and not exists (
       select 1 from public.program_access access where access.program_id = v_program_id
     ) then
    return new;
  end if;

  raise exception 'Unreleased imported catalog access is limited to its QA role group.'
    using errcode = '42501';
end;
$$;

revoke all on function public.fn_guard_unreleased_import_access() from public, anon, authenticated;
