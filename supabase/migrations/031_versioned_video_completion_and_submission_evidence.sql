-- Bind required-video completion to the exact authored asset and make learner
-- assignment evidence immutable after upload. Historical completion evidence
-- remains queryable even when a replacement cut invalidates current credit.

set lock_timeout = '10s';

create or replace function public.fn_video_asset_version(p_content jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_content) = 'object'
      and nullif(btrim(p_content ->> 'file_path'), '') is not null
      and jsonb_typeof(p_content -> 'duration_seconds') = 'number'
      and (p_content ->> 'duration_seconds')::numeric > 0
    then btrim(p_content ->> 'file_path')
      || '#duration=' || (p_content ->> 'duration_seconds')
    else null
  end;
$$;

revoke all on function public.fn_video_asset_version(jsonb)
  from public, anon, authenticated;

alter table public.user_block_progress
  add column if not exists asset_version text;

update public.user_block_progress progress
set asset_version = public.fn_video_asset_version(block.content)
from public.content_blocks block
join public.user_video_progress video_progress
  on video_progress.block_id = block.id
where block.id = progress.block_id
  and block.block_type = 'video'
  and video_progress.user_id = progress.user_id
  and video_progress.asset_version =
    public.fn_video_asset_version(block.content)
  and progress.asset_version is null;

create table if not exists public.user_video_completion_history (
  user_id uuid not null references public.profiles(id) on delete restrict,
  block_id uuid not null references public.content_blocks(id) on delete restrict,
  asset_version text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, block_id, asset_version),
  check (length(asset_version) between 1 and 2048)
);

insert into public.user_video_completion_history (
  user_id, block_id, asset_version, completed_at
)
select progress.user_id, progress.block_id, progress.asset_version,
       progress.completed_at
from public.user_block_progress progress
join public.content_blocks block on block.id = progress.block_id
where block.block_type = 'video'
  and progress.asset_version is not null
on conflict (user_id, block_id, asset_version) do nothing;

alter table public.user_video_completion_history enable row level security;
revoke all on table public.user_video_completion_history
  from public, anon, authenticated, service_role;
grant select on table public.user_video_completion_history to authenticated;
grant select, insert on table public.user_video_completion_history
  to service_role;

drop policy if exists user_video_completion_history_self_read
  on public.user_video_completion_history;
create policy user_video_completion_history_self_read
  on public.user_video_completion_history
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_video_completion_history_admin_read
  on public.user_video_completion_history;
create policy user_video_completion_history_admin_read
  on public.user_video_completion_history
  for select to authenticated
  using (public.is_admin(auth.uid()));

create or replace function public.trg_preserve_video_completion_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Video completion history is append-only.'
    using errcode = '55000';
end;
$$;

revoke all on function public.trg_preserve_video_completion_history()
  from public, anon, authenticated, service_role;
drop trigger if exists preserve_video_completion_history
  on public.user_video_completion_history;
create trigger preserve_video_completion_history
before update or delete on public.user_video_completion_history
for each row execute function public.trg_preserve_video_completion_history();

-- Migration 019 predates versioned completion history. Preserve its validated,
-- exact-delete implementation behind an owner-only helper, and keep the public
-- RPC as a forward guard that locks every completion-bearing video table in the
-- same order as playback before it delegates to the original rollback.
alter function public.fn_rollback_course_import(text, jsonb)
  rename to fn_rollback_course_import_v019_without_video_history_guard;
alter function public.fn_rollback_course_import_v019_without_video_history_guard(text, jsonb)
  set schema private;
revoke all on function
  private.fn_rollback_course_import_v019_without_video_history_guard(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.fn_rollback_course_import(
  p_import_id text,
  p_owned jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_blocks uuid[];
begin
  -- Malformed payloads cannot name a safe history scope. Delegate them to the
  -- original validator, which rejects every malformed shape before deleting.
  if p_owned is null
    or jsonb_typeof(p_owned) <> 'object'
    or jsonb_typeof(p_owned -> 'content_blocks') <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_owned -> 'content_blocks') entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'id') <> 'string'
        or entry ->> 'id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  then
    return private.fn_rollback_course_import_v019_without_video_history_guard(
      p_import_id,
      p_owned
    );
  end if;

  select coalesce(array_agg((entry ->> 'id')::uuid), '{}'::uuid[])
    into v_content_blocks
  from jsonb_array_elements(p_owned -> 'content_blocks') entry;

  -- fn_record_video_playback writes video progress, history, then block credit.
  -- Matching that order prevents a lock inversion while closing the preflight
  -- race for both normal playback and trusted history inserts.
  lock table
    public.user_video_progress,
    public.user_video_completion_history,
    public.user_block_progress
  in share row exclusive mode;

  if exists (
    select 1
    from public.user_video_completion_history history
    where history.block_id = any(v_content_blocks)
  ) then
    raise exception 'Rollback blocked: immutable video completion history exists.';
  end if;

  return private.fn_rollback_course_import_v019_without_video_history_guard(
    p_import_id,
    p_owned
  );
end;
$$;

revoke all on function public.fn_rollback_course_import(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_rollback_course_import(text, jsonb)
  to service_role;

create or replace function public.fn_lesson_is_complete(
  p_user_id uuid,
  p_lesson_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if not coalesce(public.fn_can_read_user_state(p_user_id), false) then
    return false;
  end if;
  select lesson_type into v_type
  from public.lessons
  where id = p_lesson_id;
  if v_type is null then return false; end if;

  if v_type = 'content' then
    return not exists (
      select 1
      from public.content_blocks block
      where block.lesson_id = p_lesson_id
        and block.is_required_for_completion = true
        and not exists (
          select 1
          from public.user_block_progress progress
          where progress.user_id = p_user_id
            and progress.block_id = block.id
            and (
              block.block_type <> 'video'
              or (
                public.fn_video_asset_version(block.content) is not null
                and progress.asset_version =
                  public.fn_video_asset_version(block.content)
              )
            )
        )
    );
  elsif v_type = 'quiz' then
    return exists (
      select 1 from public.user_quiz_attempts attempt
      where attempt.user_id = p_user_id
        and attempt.lesson_id = p_lesson_id
        and attempt.passed = true
    );
  elsif v_type = 'assignment' then
    return exists (
      select 1 from public.assignment_submissions submission
      where submission.user_id = p_user_id
        and submission.lesson_id = p_lesson_id
        and submission.status = 'approved'
    );
  end if;
  return false;
end;
$$;

create or replace function public.fn_course_is_complete(
  p_user_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_can_read_user_state(p_user_id)
    and exists (select 1 from public.courses where id = p_course_id)
    and not exists (
      select 1
      from public.modules module
      join public.lessons lesson on lesson.module_id = module.id
      where module.course_id = p_course_id
        and lesson.is_required_for_completion = true
        and not public.fn_lesson_is_complete(p_user_id, lesson.id)
    );
$$;

create or replace function public.fn_course_completion_percent(
  p_user_id uuid,
  p_course_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with required as (
    select lesson.id
    from public.modules module
    join public.lessons lesson on lesson.module_id = module.id
    where module.course_id = p_course_id
      and lesson.is_required_for_completion = true
  ), totals as (
    select count(*)::numeric as count from required
  ), completed as (
    select count(*)::numeric as count
    from required
    where public.fn_lesson_is_complete(p_user_id, required.id)
  )
  select case
    when not public.fn_can_read_user_state(p_user_id) then 0
    when (select count from totals) = 0 then 0
    else round(
      ((select count from completed) / (select count from totals)) * 100
    )::integer
  end;
$$;

create or replace function public.fn_lesson_is_unlocked(
  p_user_id uuid,
  p_lesson_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prereq_id uuid;
  v_min_score integer;
  v_prereq_type text;
  v_course_id uuid;
  v_best_score integer;
  v_has_direct_access boolean;
  v_has_eligible_program_path boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and p_user_id is distinct from auth.uid()
    and not coalesce(public.is_admin(auth.uid()), false)
  then
    return false;
  end if;

  if not coalesce(public.fn_can_read_user_state(p_user_id), false) then
    return false;
  end if;

  select lesson.prerequisite_lesson_id,
         lesson.prerequisite_quiz_min_score,
         module.course_id
    into v_prereq_id, v_min_score, v_course_id
  from public.lessons lesson
  join public.modules module on module.id = lesson.module_id
  where lesson.id = p_lesson_id;

  if v_course_id is null then return false; end if;
  if public.is_admin(p_user_id) then return true; end if;

  select exists (
    select 1
    from public.user_role_groups membership
    join public.course_access access
      on access.role_group_id = membership.role_group_id
    join public.courses course on course.id = access.course_id
    where membership.user_id = p_user_id
      and access.course_id = v_course_id
      and course.is_published = true
  ) into v_has_direct_access;

  if not v_has_direct_access then
    select exists (
      select 1
      from public.user_role_groups membership
      join public.program_access access
        on access.role_group_id = membership.role_group_id
      join public.programs program on program.id = access.program_id
      join public.program_courses current_course
        on current_course.program_id = access.program_id
       and current_course.course_id = v_course_id
      join public.courses course on course.id = current_course.course_id
      where membership.user_id = p_user_id
        and program.is_published = true
        and course.is_published = true
        and (
          program.course_order_mode = 'free'
          or not exists (
            select 1
            from public.program_courses prior_course
            where prior_course.program_id = current_course.program_id
              and prior_course.sort_order < current_course.sort_order
              and not public.fn_course_is_complete(
                p_user_id,
                prior_course.course_id
              )
          )
        )
    ) into v_has_eligible_program_path;

    if not v_has_eligible_program_path then return false; end if;
  end if;

  if v_prereq_id is null then return true; end if;
  if not public.fn_lesson_is_complete(p_user_id, v_prereq_id) then
    return false;
  end if;

  if v_min_score is not null then
    select lesson_type into v_prereq_type
    from public.lessons
    where id = v_prereq_id;
    if v_prereq_type = 'quiz' then
      select max(score) into v_best_score
      from public.user_quiz_attempts
      where user_id = p_user_id
        and lesson_id = v_prereq_id
        and passed = true;
      if v_best_score is null or v_best_score < v_min_score then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.fn_lesson_states(
  p_user_id uuid,
  p_lesson_ids uuid[]
)
returns table (
  lesson_id uuid,
  is_complete boolean,
  is_unlocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.fn_can_read_user_state(p_user_id), false) then
    raise exception 'Lesson states require learner-self or admin access.'
      using errcode = '42501';
  end if;
  if p_lesson_ids is null
    or cardinality(p_lesson_ids) = 0
    or cardinality(p_lesson_ids) > 500
    or array_position(p_lesson_ids, null) is not null
  then
    raise exception 'Lesson state request must contain 1 to 500 non-null lesson IDs.'
      using errcode = '22023';
  end if;

  return query
  select requested.lesson_id,
         public.fn_lesson_is_complete(p_user_id, requested.lesson_id),
         public.fn_lesson_is_unlocked(p_user_id, requested.lesson_id)
  from (
    select distinct requested_id as lesson_id
    from unnest(p_lesson_ids) requested_id
  ) requested;
end;
$$;

create or replace function public.fn_admin_lesson_completion_states(
  p_user_ids uuid[],
  p_lesson_ids uuid[]
)
returns table (
  user_id uuid,
  lesson_id uuid,
  is_complete boolean,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.is_admin(auth.uid()), false)
  then
    raise exception 'Admin lesson completion states require admin access.'
      using errcode = '42501';
  end if;
  if p_user_ids is null
    or p_lesson_ids is null
    or cardinality(p_user_ids) = 0
    or cardinality(p_lesson_ids) = 0
    or cardinality(p_user_ids) > 500
    or cardinality(p_lesson_ids) > 500
    or cardinality(p_user_ids)::bigint * cardinality(p_lesson_ids)::bigint > 5000
    or array_position(p_user_ids, null) is not null
    or array_position(p_lesson_ids, null) is not null
  then
    raise exception 'Admin lesson state request must contain non-null IDs and at most 5000 user/lesson pairs.'
      using errcode = '22023';
  end if;

  return query
  select requested_user.user_id,
         requested_lesson.lesson_id,
         state.is_complete,
         case when state.is_complete then completion.completed_at else null end
  from (
    select distinct requested_id as user_id
    from unnest(p_user_ids) requested_id
  ) requested_user
  cross join (
    select distinct requested_id as lesson_id
    from unnest(p_lesson_ids) requested_id
  ) requested_lesson
  cross join lateral (
    select public.fn_lesson_is_complete(
      requested_user.user_id,
      requested_lesson.lesson_id
    ) as is_complete
  ) state
  left join public.user_lesson_completions completion
    on completion.user_id = requested_user.user_id
   and completion.lesson_id = requested_lesson.lesson_id;
end;
$$;

create or replace function public.trg_after_block_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid;
  v_course_id uuid;
  v_program_rec record;
  v_completion_changed boolean := false;
begin
  select lesson.id, module.course_id into v_lesson_id, v_course_id
  from public.content_blocks block
  join public.lessons lesson on lesson.id = block.lesson_id
  join public.modules module on module.id = lesson.module_id
  where block.id = new.block_id;

  insert into public.user_course_resume (
    user_id, course_id, last_lesson_id, last_block_id, updated_at
  ) values (
    new.user_id, v_course_id, v_lesson_id, new.block_id, now()
  ) on conflict (user_id, course_id) do update set
    last_lesson_id = excluded.last_lesson_id,
    last_block_id = excluded.last_block_id,
    updated_at = excluded.updated_at;

  if public.fn_lesson_is_complete(new.user_id, v_lesson_id) then
    if tg_op = 'UPDATE'
      and old.asset_version is distinct from new.asset_version
    then
      insert into public.user_lesson_completions (
        user_id, lesson_id, completed_at
      ) values (
        new.user_id, v_lesson_id, now()
      ) on conflict (user_id, lesson_id) do update set
        completed_at = excluded.completed_at
      returning true into v_completion_changed;
    else
      insert into public.user_lesson_completions (user_id, lesson_id)
      values (new.user_id, v_lesson_id)
      on conflict (user_id, lesson_id) do nothing
      returning true into v_completion_changed;
    end if;

    if coalesce(v_completion_changed, false) then
      insert into public.audit_log (
        user_id, action, entity_type, entity_id, metadata
      ) values (
        new.user_id,
        'lesson_completed',
        'lesson',
        v_lesson_id,
        jsonb_build_object(
          'block_id', new.block_id,
          'asset_version', new.asset_version,
          'completion_event', case
            when tg_op = 'UPDATE' then 'asset_recompletion'
            else 'initial_completion'
          end
        )
      );

      perform public.fn_issue_course_certificate_if_eligible(
        new.user_id,
        v_course_id
      );
      for v_program_rec in
        select program_id
        from public.program_courses
        where course_id = v_course_id
      loop
        perform public.fn_issue_program_certificate_if_eligible(
          new.user_id,
          v_program_rec.program_id
        );
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_block_progress_after_insert
  on public.user_block_progress;
create trigger trg_user_block_progress_after_insert
after insert or update of asset_version on public.user_block_progress
for each row execute function public.trg_after_block_progress();

create or replace function public.fn_record_video_playback(
  p_user_id uuid,
  p_block_id uuid,
  p_operation text,
  p_position_seconds numeric,
  p_duration_seconds numeric,
  p_observed_from numeric default null,
  p_observed_to numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid;
  v_content jsonb;
  v_duration numeric;
  v_position numeric;
  v_ranges jsonb := '[]'::jsonb;
  v_last_position numeric;
  v_last_at timestamptz;
  v_asset_version text;
  v_stored_asset_version text;
  v_now timestamptz := clock_timestamp();
  v_span numeric;
  v_credible_span numeric;
  v_watched numeric := 0;
  v_completed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if p_user_id is distinct from auth.uid()
      or not exists (
        select 1 from public.profiles
        where id = auth.uid() and status = 'active'
      )
    then
      raise exception 'Active learner authentication required.';
    end if;
  end if;
  if p_operation not in ('observe', 'seek') then
    raise exception 'Video playback operation is invalid.';
  end if;
  if p_position_seconds is null or p_position_seconds < 0
    or p_duration_seconds is null or p_duration_seconds <= 0
    or p_position_seconds::text in ('NaN', 'Infinity', '-Infinity')
    or p_duration_seconds::text in ('NaN', 'Infinity', '-Infinity')
  then
    raise exception 'Video progress contains invalid timing data.';
  end if;

  select block.lesson_id, block.content into v_lesson_id, v_content
  from public.content_blocks block
  where block.id = p_block_id and block.block_type = 'video';
  if v_lesson_id is null then raise exception 'Video block not found.'; end if;

  v_asset_version := public.fn_video_asset_version(v_content);
  if v_asset_version is null then
    raise exception 'Video asset is missing an immutable file path and duration.';
  end if;
  v_duration := (v_content ->> 'duration_seconds')::numeric;
  if abs(v_duration - p_duration_seconds) > 2 then
    raise exception 'Video duration does not match the lesson asset.';
  end if;
  if p_position_seconds > v_duration + 1 then
    raise exception 'Video position does not match the lesson asset.';
  end if;
  if not public.fn_lesson_is_unlocked(p_user_id, v_lesson_id) then
    raise exception 'Complete the prerequisite lessons first.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_block_id::text, 0)
  );
  select watched_ranges, last_observed_position_seconds, last_observed_at,
         asset_version
    into v_ranges, v_last_position, v_last_at, v_stored_asset_version
  from public.user_video_progress
  where user_id = p_user_id and block_id = p_block_id
  for update;
  if v_stored_asset_version is distinct from v_asset_version then
    v_ranges := '[]'::jsonb;
    v_last_position := null;
    v_last_at := null;
  end if;
  v_ranges := coalesce(v_ranges, '[]'::jsonb);

  if p_operation = 'observe' then
    if p_observed_from is null or p_observed_to is null
      or p_observed_from < 0 or p_observed_to < 0
      or p_observed_from::text in ('NaN', 'Infinity', '-Infinity')
      or p_observed_to::text in ('NaN', 'Infinity', '-Infinity')
      or p_observed_to > v_duration + 1
      or abs(p_position_seconds - p_observed_to) > 1
    then
      raise exception 'Video position does not match the observed playback range.';
    end if;
    v_span := p_observed_to - p_observed_from;
    v_credible_span := case
      when v_last_at is null then 3
      else least(15, greatest(0, extract(epoch from (v_now - v_last_at))) * 2.25)
    end;
    if v_span <= 0 or v_span > v_credible_span
      or (v_last_at is null and p_observed_from > 1)
      or (v_last_at is not null and abs(p_observed_from - v_last_position) > 1)
    then
      raise exception 'Video playback observation could not be verified.';
    end if;
    v_ranges := v_ranges || jsonb_build_array(
      jsonb_build_array(
        greatest(0, p_observed_from),
        least(v_duration, p_observed_to)
      )
    );
    v_position := least(v_duration, p_observed_to);
  else
    v_position := least(v_duration, p_position_seconds);
  end if;

  with parsed as (
    select greatest(0, (entry ->> 0)::numeric) as range_start,
           least(v_duration, (entry ->> 1)::numeric) as range_end
    from jsonb_array_elements(v_ranges) entry
    where jsonb_typeof(entry) = 'array'
      and jsonb_array_length(entry) = 2
      and jsonb_typeof(entry -> 0) = 'number'
      and jsonb_typeof(entry -> 1) = 'number'
  ), valid as (
    select * from parsed where range_end > range_start
  ), ordered as (
    select *, max(range_end) over (
      order by range_start, range_end
      rows between unbounded preceding and 1 preceding
    ) as prior_max
    from valid
  ), marked as (
    select *, case when prior_max is null or range_start > prior_max + 0.5
      then 1 else 0 end as new_group
    from ordered
  ), grouped as (
    select min(range_start) as range_start, max(range_end) as range_end
    from (
      select *, sum(new_group) over (
        order by range_start, range_end
      ) as group_id
      from marked
    ) numbered
    group by group_id
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_array(range_start, range_end)
             order by range_start
           ),
           '[]'::jsonb
         ),
         coalesce(sum(range_end - range_start), 0)
    into v_ranges, v_watched
  from grouped;

  v_completed := v_watched / v_duration >= 0.9;
  insert into public.user_video_progress (
    user_id, block_id, position_seconds, duration_seconds, watched_ranges,
    last_observed_position_seconds, last_observed_at, asset_version, updated_at
  ) values (
    p_user_id, p_block_id, v_position, v_duration, v_ranges,
    v_position, v_now, v_asset_version, v_now
  ) on conflict (user_id, block_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    watched_ranges = excluded.watched_ranges,
    last_observed_position_seconds = excluded.last_observed_position_seconds,
    last_observed_at = excluded.last_observed_at,
    asset_version = excluded.asset_version,
    updated_at = excluded.updated_at;

  if v_completed then
    insert into public.user_video_completion_history (
      user_id, block_id, asset_version, completed_at
    ) values (
      p_user_id, p_block_id, v_asset_version, v_now
    ) on conflict (user_id, block_id, asset_version) do nothing;

    insert into public.user_block_progress (
      user_id, block_id, asset_version, completed_at
    ) values (
      p_user_id, p_block_id, v_asset_version, v_now
    ) on conflict (user_id, block_id) do update set
      asset_version = excluded.asset_version,
      completed_at = excluded.completed_at
    where user_block_progress.asset_version is distinct from
      excluded.asset_version;
  end if;

  return jsonb_build_object(
    'lessonId', v_lesson_id,
    'positionSeconds', v_position,
    'watchedRanges', v_ranges,
    'watchedPercent', round(least(1, v_watched / v_duration) * 100)::integer,
    'completed', v_completed
  );
end;
$$;

-- Learners may upload and read their own submissions, but only trusted
-- service operations may delete them. This keeps a submitted evidence path
-- immutable; abandoned-upload cleanup remains possible with the service role.
drop policy if exists "submissions_self_delete" on storage.objects;

revoke all on function public.fn_lesson_is_complete(uuid, uuid)
  from public, anon;
revoke all on function public.fn_course_is_complete(uuid, uuid)
  from public, anon;
revoke all on function public.fn_course_completion_percent(uuid, uuid)
  from public, anon;
revoke all on function public.fn_lesson_is_unlocked(uuid, uuid)
  from public, anon;
revoke all on function public.fn_lesson_states(uuid, uuid[])
  from public, anon;
revoke all on function public.fn_admin_lesson_completion_states(uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function public.fn_record_video_playback(
  uuid, uuid, text, numeric, numeric, numeric, numeric
) from public, anon;
revoke all on function public.trg_after_block_progress()
  from public, anon, authenticated;

grant execute on function public.fn_lesson_is_complete(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_course_is_complete(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_course_completion_percent(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_lesson_is_unlocked(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fn_lesson_states(uuid, uuid[])
  to authenticated, service_role;
grant execute on function public.fn_admin_lesson_completion_states(uuid[], uuid[])
  to authenticated, service_role;
grant execute on function public.fn_record_video_playback(
  uuid, uuid, text, numeric, numeric, numeric, numeric
) to authenticated, service_role;
