begin;

set local lock_timeout = '10s';

create or replace function public.fn_update_institute_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_role text,
  p_role_group_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_actor_status text;
  v_target_role text;
begin
  perform public.fn_hugo_require_service_role();

  if p_role is null or p_role not in ('owner', 'admin', 'learner') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROLE');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );

  select actor.system_role, actor.status
    into v_actor_role, v_actor_status
    from public.profiles actor
    where actor.id = p_actor_id
    for update;
  if not found
     or v_actor_status <> 'active'
     or v_actor_role not in ('owner', 'admin')
     or not coalesce(public.fn_hugo_access_is_active(p_actor_id), false) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  select target.system_role
    into v_target_role
    from public.profiles target
    where target.id = p_target_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if p_actor_id = p_target_id
     and v_target_role is distinct from p_role then
    return jsonb_build_object('ok', false, 'code', 'SELF_ROLE_CHANGE');
  end if;

  begin
    update public.profiles
       set system_role = p_role
     where id = p_target_id;

    if p_role_group_ids is not null then
      delete from public.user_role_groups
       where user_id = p_target_id;

      insert into public.user_role_groups (user_id, role_group_id)
      select p_target_id, role_group.role_group_id
        from (
          select distinct role_group_id
            from unnest(p_role_group_ids) as requested(role_group_id)
        ) role_group;
    end if;
  exception
    when foreign_key_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'ROLE_GROUP_NOT_FOUND'
      );
    when check_violation then
      if sqlerrm in (
        'Cannot remove the final usable Institute owner.',
        'Cannot remove the last active owner.',
        'Cannot delete the last remaining owner.'
      ) then
        return jsonb_build_object(
          'ok', false, 'code', 'FINAL_OWNER_GUARD'
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_target_id,
    'role', p_role,
    'status',
      case
        when v_target_role = p_role and p_role_group_ids is null
          then 'unchanged'
        else 'updated'
      end
  );
end;
$$;

revoke all on function public.fn_update_institute_role(
  uuid, uuid, text, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.fn_update_institute_role(
  uuid, uuid, text, uuid[]
) to service_role;

commit;
