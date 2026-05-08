-- Phase 3: transactional integrity for role groups, module order, and certificates.

create or replace function public.fn_set_user_role_groups(
  p_user_id uuid,
  p_role_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required.';
  end if;

  delete from public.user_role_groups
  where user_id = p_user_id;

  insert into public.user_role_groups (user_id, role_group_id)
  select p_user_id, rg.role_group_id
  from (
    select distinct role_group_id
    from unnest(coalesce(p_role_group_ids, array[]::uuid[])) as t(role_group_id)
  ) rg;
end;
$$;

create or replace function public.fn_save_user_settings(
  p_user_id uuid,
  p_system_role text,
  p_status text,
  p_role_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required.';
  end if;

  update public.profiles
  set system_role = p_system_role,
      status = p_status
  where id = p_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'User not found.';
  end if;

  perform public.fn_set_user_role_groups(p_user_id, p_role_group_ids);
end;
$$;

create or replace function public.fn_move_module(
  p_module_id uuid,
  p_course_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current record;
  v_neighbor record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Admin access required.';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception 'Direction must be up or down.';
  end if;

  select id, sort_order
  into v_current
  from public.modules
  where id = p_module_id
    and course_id = p_course_id
  for update;

  if not found then
    raise exception 'Module not found.';
  end if;

  if p_direction = 'up' then
    select id, sort_order
    into v_neighbor
    from public.modules
    where course_id = p_course_id
      and sort_order < v_current.sort_order
    order by sort_order desc
    limit 1
    for update;
  else
    select id, sort_order
    into v_neighbor
    from public.modules
    where course_id = p_course_id
      and sort_order > v_current.sort_order
    order by sort_order asc
    limit 1
    for update;
  end if;

  if not found then
    return;
  end if;

  update public.modules
  set sort_order = case
    when id = v_current.id then v_neighbor.sort_order
    when id = v_neighbor.id then v_current.sort_order
    else sort_order
  end
  where id in (v_current.id, v_neighbor.id);
end;
$$;

create table if not exists public.certificate_number_counters (
  prefix text not null,
  certificate_year integer not null,
  next_number integer not null default 1 check (next_number > 0),
  primary key (prefix, certificate_year)
);

alter table public.certificate_number_counters enable row level security;

with all_certs as (
  select certificate_number from public.certificates
  union all
  select certificate_number from public.program_certificates
),
parsed as (
  select
    m[1] as prefix,
    m[2]::integer as certificate_year,
    m[3]::integer as issued_number
  from all_certs
  cross join lateral regexp_match(
    certificate_number,
    '^(.+)-([0-9]{4})-([0-9]+)$'
  ) as m
)
insert into public.certificate_number_counters (
  prefix,
  certificate_year,
  next_number
)
select
  prefix,
  certificate_year,
  max(issued_number) + 1
from parsed
group by prefix, certificate_year
on conflict (prefix, certificate_year) do update
set next_number = greatest(
  public.certificate_number_counters.next_number,
  excluded.next_number
);

create or replace function public.fn_next_certificate_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now());
  v_next integer;
begin
  insert into public.certificate_number_counters (
    prefix,
    certificate_year,
    next_number
  )
  values (p_prefix, v_year, 2)
  on conflict (prefix, certificate_year) do update
    set next_number = public.certificate_number_counters.next_number + 1
  returning next_number - 1 into v_next;

  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.fn_set_user_role_groups(uuid, uuid[]) from public;
revoke all on function public.fn_save_user_settings(uuid, text, text, uuid[]) from public;
revoke all on function public.fn_move_module(uuid, uuid, text) from public;
grant execute on function public.fn_set_user_role_groups(uuid, uuid[]) to authenticated;
grant execute on function public.fn_save_user_settings(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.fn_move_module(uuid, uuid, text) to authenticated;

