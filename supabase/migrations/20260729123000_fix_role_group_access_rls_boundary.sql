-- Keep the admin access RPC invoker-secure while evaluating the importer-owned
-- QA boundary through the existing security-definer helper. The release ledger
-- is intentionally unreadable to ordinary authenticated sessions, so an
-- inline query from an invoker function fails before the admin RLS policy can
-- authorize the access mutation.

create or replace function public.fn_set_role_group_access(
  p_role_group_id uuid,
  p_scope text,
  p_target_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_scope not in ('program', 'course') then
    raise exception 'Role group access scope must be program or course.' using errcode = '22023';
  end if;

  perform 1 from public.role_groups where id = p_role_group_id for update;
  if not found then
    raise exception 'Role group not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'role-group-access:' || p_role_group_id::text || ':' || p_scope || ':' || p_target_id::text,
      0
    )
  );

  if private.fn_is_unreleased_import_qa_role_group(p_role_group_id) then
    raise exception 'Unreleased imported catalog QA role group is read-only.' using errcode = '42501';
  end if;

  if p_scope = 'program' then
    perform 1 from public.programs where id = p_target_id;
    if not found then
      raise exception 'Program not found.' using errcode = 'P0002';
    end if;

    if p_enabled then
      insert into public.program_access (program_id, role_group_id)
      values (p_target_id, p_role_group_id)
      on conflict (program_id, role_group_id) do nothing;
    else
      delete from public.program_access
      where program_id = p_target_id
        and role_group_id = p_role_group_id;
    end if;
  else
    perform 1 from public.courses where id = p_target_id;
    if not found then
      raise exception 'Course not found.' using errcode = 'P0002';
    end if;

    if p_enabled then
      insert into public.course_access (course_id, role_group_id)
      values (p_target_id, p_role_group_id)
      on conflict (course_id, role_group_id) do nothing;
    else
      delete from public.course_access
      where course_id = p_target_id
        and role_group_id = p_role_group_id;
    end if;
  end if;
end;
$$;

revoke all on function public.fn_set_role_group_access(uuid, text, uuid, boolean)
  from public, anon;
grant execute on function public.fn_set_role_group_access(uuid, text, uuid, boolean)
  to authenticated;
