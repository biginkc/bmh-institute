-- Close security gaps found after merging the Hugo connector with the latest
-- Institute migration stack. Keep this forward-only because the earlier Hugo
-- migrations may already be present on hosted projects.

begin;

set local lock_timeout = '10s';

-- Every public table in Institute must have RLS enabled even when direct role
-- privileges are already revoked. Default-deny is intentional for this
-- connector-owned rollback metadata.
alter table public.hugo_access_acl_baseline enable row level security;
drop policy if exists hugo_active_authenticated_gate
  on public.hugo_access_acl_baseline;
create policy hugo_active_authenticated_gate
  on public.hugo_access_acl_baseline
  as restrictive
  for all
  to authenticated
  using ((select public.fn_hugo_access_is_active(auth.uid())))
  with check ((select public.fn_hugo_access_is_active(auth.uid())));

-- This SECURITY DEFINER RPC predates Hugo. Its direct profile-status check can
-- bypass the restrictive table policies for an expired grant, so bind it to
-- the same active-access function used everywhere else.
do $migration$
declare
  v_source text;
  v_old text := $old$
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor_id
      and profile.status = 'active'
  ) then
    raise exception 'Learner lesson states require an active actor.'
      using errcode = '42501';
  end if;
$old$;
  v_new text := $new$
  if not public.fn_hugo_access_is_active(v_actor_id) then
    raise exception 'Learner lesson states require active Hugo access.'
      using errcode = '42501';
  end if;
$new$;
begin
  v_source := pg_get_functiondef(
    'public.fn_learner_lesson_states_v1(uuid,uuid[])'::regprocedure
  );
  if strpos(v_source, v_old) = 0
     or strpos(v_source, v_new) > 0 then
    raise exception
      'Hugo learner lesson-state source definition drifted; refusing patch.'
      using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);
  if strpos(v_source, v_old) > 0
     or strpos(v_source, v_new) = 0 then
    raise exception
      'Hugo learner lesson-state source replacement failed.'
      using errcode = '55000';
  end if;
  execute v_source;
end;
$migration$;

revoke all on function public.fn_learner_lesson_states_v1(uuid, uuid[])
  from public, anon;
grant execute on function public.fn_learner_lesson_states_v1(uuid, uuid[])
  to authenticated;

-- The final-owner triggers are the authoritative last line of defence. Turn
-- their two known check violations into a saved, hash-bound terminal receipt
-- so exact retries converge and the preflight claim cannot remain stuck.
do $migration$
declare
  v_source text;
  v_old text := $old$
  perform public.hugo_apply_access_unhashed(
    p_operation_id,
    p_email,
    p_role,
    v_effective_config,
    p_status,
    v_effective_access_expires_at,
    p_app_user_id
  );
$old$;
  v_new text := $new$
  begin
    perform public.hugo_apply_access_unhashed(
      p_operation_id,
      p_email,
      p_role,
      v_effective_config,
      p_status,
      v_effective_access_expires_at,
      p_app_user_id
    );
  exception when check_violation then
    if sqlerrm in (
      'Cannot remove the final usable Institute owner.',
      'Cannot remove the final usable Institute owner grant.'
    ) then
      return public.fn_hugo_store_guard_failure(
        p_operation_id,
        case
          when p_status = 'suspended' then 'suspend'
          when p_status = 'revoked' then 'revoke'
          else 'grant'
        end,
        v_email,
        v_hash,
        p_role,
        v_config,
        p_status,
        p_access_expires_at,
        p_app_user_id,
        false,
        'final_owner_guard',
        'The final usable Institute owner cannot lose access, be demoted, or receive an expiry.'
      );
    end if;
    raise;
  end;
$new$;
begin
  v_source := pg_get_functiondef(
    'public.hugo_apply_access(uuid,text,text,jsonb,text,timestamptz,text)'::regprocedure
  );
  if strpos(v_source, v_old) = 0
     or strpos(v_source, v_new) > 0 then
    raise exception
      'Hugo apply-access source definition drifted; refusing patch.'
      using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);
  if strpos(v_source, v_old) > 0
     or strpos(v_source, v_new) = 0 then
    raise exception
      'Hugo apply-access source replacement failed.'
      using errcode = '55000';
  end if;
  execute v_source;
end;
$migration$;

revoke all on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) to service_role;

commit;
