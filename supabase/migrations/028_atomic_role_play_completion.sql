-- Persist a verified Closer Lab result and its required block completion in one
-- service-only transaction. The application verifies the signed completion
-- token; this function independently rechecks learner state and course access.

set lock_timeout = '10s';

create or replace function public.fn_complete_role_play_block(
  p_user_id uuid,
  p_block_id uuid,
  p_scenario_id text,
  p_attempt_id text,
  p_score integer,
  p_goals_met jsonb default '{}'::jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid;
  v_existing public.role_play_results%rowtype;
  v_result_created boolean := false;
  v_progress_created boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'role play completion requires service role';
  end if;
  if p_scenario_id is null
    or length(p_scenario_id) not between 1 and 256
    or p_scenario_id ~ '[[:cntrl:]]'
    or p_attempt_id is null
    or length(p_attempt_id) not between 1 and 256
    or p_attempt_id ~ '[[:cntrl:]]'
    or p_score is null
    or p_score not between 0 and 100
    or jsonb_typeof(coalesce(p_goals_met, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_goals_met, '{}'::jsonb)::text) > 4096
    or octet_length(coalesce(p_summary, '{}'::jsonb)::text) > 4096
  then
    raise exception 'invalid role play completion payload';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and status = 'active'
      and system_role = 'learner'
  ) then
    raise exception 'active learner is required';
  end if;

  select cb.lesson_id
    into v_lesson_id
  from public.content_blocks cb
  where cb.id = p_block_id
    and cb.block_type = 'role_play'
    and cb.content ->> 'scenario_id' = p_scenario_id
  for update;

  if v_lesson_id is null then
    raise exception 'role play block and scenario do not match';
  end if;
  if not public.fn_lesson_is_unlocked(p_user_id, v_lesson_id) then
    raise exception 'role play lesson is not accessible and unlocked';
  end if;

  select *
    into v_existing
  from public.role_play_results
  where user_id = p_user_id
    and attempt_id = p_attempt_id
  for update;

  if found then
    if v_existing.block_id is distinct from p_block_id
      or v_existing.scenario_id is distinct from p_scenario_id
      or v_existing.score is distinct from p_score
      or v_existing.goals_met is distinct from coalesce(p_goals_met, '{}'::jsonb)
      or v_existing.summary is distinct from coalesce(p_summary, '{}'::jsonb)
    then
      raise exception 'role play attempt is already bound to different result data';
    end if;
  else
    insert into public.role_play_results (
      user_id,
      block_id,
      scenario_id,
      attempt_id,
      score,
      goals_met,
      summary
    )
    values (
      p_user_id,
      p_block_id,
      p_scenario_id,
      p_attempt_id,
      p_score,
      coalesce(p_goals_met, '{}'::jsonb),
      coalesce(p_summary, '{}'::jsonb)
    )
    on conflict (user_id, attempt_id) do nothing
    returning true into v_result_created;

    if not coalesce(v_result_created, false) then
      select *
        into v_existing
      from public.role_play_results
      where user_id = p_user_id
        and attempt_id = p_attempt_id
      for update;
      if not found
        or v_existing.block_id is distinct from p_block_id
        or v_existing.scenario_id is distinct from p_scenario_id
        or v_existing.score is distinct from p_score
        or v_existing.goals_met is distinct from coalesce(p_goals_met, '{}'::jsonb)
        or v_existing.summary is distinct from coalesce(p_summary, '{}'::jsonb)
      then
        raise exception 'role play attempt conflict could not be reconciled';
      end if;
    end if;
  end if;

  insert into public.user_block_progress (user_id, block_id)
  values (p_user_id, p_block_id)
  on conflict (user_id, block_id) do nothing
  returning true into v_progress_created;

  return jsonb_build_object(
    'lessonId', v_lesson_id,
    'alreadyMarked', not coalesce(v_progress_created, false),
    'resultCreated', coalesce(v_result_created, false)
  );
end;
$$;

revoke all on function public.fn_complete_role_play_block(
  uuid, uuid, text, text, integer, jsonb, jsonb
) from public;
revoke all on function public.fn_complete_role_play_block(
  uuid, uuid, text, text, integer, jsonb, jsonb
) from anon;
revoke all on function public.fn_complete_role_play_block(
  uuid, uuid, text, text, integer, jsonb, jsonb
) from authenticated;
grant execute on function public.fn_complete_role_play_block(
  uuid, uuid, text, text, integer, jsonb, jsonb
) to service_role;

comment on function public.fn_complete_role_play_block(
  uuid, uuid, text, text, integer, jsonb, jsonb
) is 'Atomically persists one verified Closer Lab result and required block progress after rechecking active learner access, unlock, block, scenario, and replay identity.';
