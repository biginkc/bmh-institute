-- Transactional controls for the admin catalog editors.
-- All operations run under the caller's RLS policies. The advisory locks
-- serialize competing writes for the same role group or program.

set lock_timeout = '10s';

do $$
declare
  duplicate_count integer;
begin
  select count(*) into duplicate_count
  from (
    select program_id, sort_order
    from public.program_courses
    group by program_id, sort_order
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'Cannot install program ordering controls: % duplicate sort-order groups require reconciliation first.',
      duplicate_count
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists program_courses_program_sort_order_uidx
  on public.program_courses (program_id, sort_order);

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
declare
  v_is_protected boolean;
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

  -- Imported review groups are owned by the release workflow. Generic admin
  -- access editing must remain read-only until that workflow replaces them.
  select exists (
    select 1
    from public.program_access access
    join public.programs program on program.id = access.program_id
    where access.role_group_id = p_role_group_id
      and program.content_import_id is not null
      and program.is_published = false
      and not exists (
        select 1
        from public.content_import_release_records release
        where release.import_id = program.content_import_id
      )
      and (
        select count(*)
        from public.program_access candidate
        where candidate.program_id = program.id
      ) = 1
  ) into v_is_protected;

  if v_is_protected then
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

create or replace function public.fn_attach_course_to_program(
  p_program_id uuid,
  p_course_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from public.programs where id = p_program_id for update;
  if not found then
    raise exception 'Program not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.courses where id = p_course_id;
  if not found then
    raise exception 'Course not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('program-courses:' || p_program_id::text, 0));

  insert into public.program_courses (program_id, course_id, sort_order)
  values (
    p_program_id,
    p_course_id,
    coalesce((select max(sort_order) + 1 from public.program_courses where program_id = p_program_id), 0)
  )
  on conflict (program_id, course_id) do nothing;
end;
$$;

revoke all on function public.fn_attach_course_to_program(uuid, uuid)
  from public, anon;
grant execute on function public.fn_attach_course_to_program(uuid, uuid)
  to authenticated;

create or replace function public.fn_move_program_course(
  p_program_id uuid,
  p_course_id uuid,
  p_direction text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_position integer;
  v_neighbor_position integer;
  v_count integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Program course direction must be up or down.' using errcode = '22023';
  end if;

  perform 1 from public.programs where id = p_program_id for update;
  if not found then
    raise exception 'Program not found.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('program-courses:' || p_program_id::text, 0));

  select count(*) into v_count
  from public.program_courses
  where program_id = p_program_id;

  with ordered as (
    select id,
      row_number() over (order by sort_order, id)::integer as position
    from public.program_courses
    where program_id = p_program_id
  )
  select position into v_position from ordered where id = (
    select id from public.program_courses
    where program_id = p_program_id and course_id = p_course_id
  );

  if v_position is null then
    raise exception 'Course is not attached to this program.' using errcode = 'P0002';
  end if;

  v_neighbor_position := v_position + case when p_direction = 'up' then -1 else 1 end;
  if v_neighbor_position < 1 or v_neighbor_position > v_count then
    return;
  end if;

  -- Normalize first so malformed legacy positions cannot cause a duplicate
  -- sort key. The unique index then protects all future direct writes.
  with ordered as (
    select id,
      row_number() over (order by sort_order, id)::integer as position
    from public.program_courses
    where program_id = p_program_id
  )
  update public.program_courses row
  set sort_order = -ordered.position
  from ordered
  where row.id = ordered.id;

  with ordered as (
    select id,
      row_number() over (order by sort_order desc, id)::integer as position
    from public.program_courses
    where program_id = p_program_id
  ), final_order as (
    select id,
      case
        when position = v_position then v_neighbor_position - 1
        when position = v_neighbor_position then v_position - 1
        else position - 1
      end as sort_order
    from ordered
  )
  update public.program_courses row
  set sort_order = final_order.sort_order
  from final_order
  where row.id = final_order.id;
end;
$$;

revoke all on function public.fn_move_program_course(uuid, uuid, text)
  from public, anon;
grant execute on function public.fn_move_program_course(uuid, uuid, text)
  to authenticated;
