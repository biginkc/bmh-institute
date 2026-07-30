-- Unload-safe resume checkpoint. This path never records watched coverage or completion credit.
alter table public.user_video_progress
  add column if not exists checkpoint_client_updated_at timestamptz;

create or replace function public.fn_checkpoint_video_playback(
  p_user_id uuid,
  p_block_id uuid,
  p_position_seconds numeric,
  p_duration_seconds numeric,
  p_client_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid;
  v_content jsonb;
  v_asset_version text;
  v_existing_checkpoint_client_updated_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is distinct from auth.uid()
    or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'Active learner authentication required.';
  end if;
  if p_client_updated_at is null or p_client_updated_at > v_now + interval '5 minutes'
    or p_position_seconds is null or p_position_seconds < 0
    or p_duration_seconds is null or p_duration_seconds <= 0 then
    raise exception 'Video checkpoint contains invalid timing data.';
  end if;
  select block.lesson_id, block.content into v_lesson_id, v_content
  from public.content_blocks block where block.id = p_block_id and block.block_type = 'video';
  if v_lesson_id is null then raise exception 'Video block not found.'; end if;
  v_asset_version := public.fn_video_asset_version(v_content);
  if v_asset_version is null or abs((v_content ->> 'duration_seconds')::numeric - p_duration_seconds) > 2
    or p_position_seconds > (v_content ->> 'duration_seconds')::numeric then
    raise exception 'Video checkpoint does not match the lesson asset.';
  end if;
  if not public.fn_lesson_is_unlocked(p_user_id, v_lesson_id) then raise exception 'Complete the prerequisite lessons first.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_block_id::text, 0));
  select checkpoint_client_updated_at
    into v_existing_checkpoint_client_updated_at
  from public.user_video_progress
    where user_id = p_user_id and block_id = p_block_id for update;
  if v_existing_checkpoint_client_updated_at is not null
    and v_existing_checkpoint_client_updated_at >= p_client_updated_at then
    return jsonb_build_object('saved', false, 'stale', true);
  end if;
  insert into public.user_video_progress (
    user_id,
    block_id,
    position_seconds,
    duration_seconds,
    watched_ranges,
    last_observed_position_seconds,
    last_observed_at,
    asset_version,
    checkpoint_client_updated_at,
    updated_at
  ) values (
    p_user_id,
    p_block_id,
    least(p_position_seconds, (v_content ->> 'duration_seconds')::numeric),
    (v_content ->> 'duration_seconds')::numeric,
    '[]'::jsonb,
    0,
    null,
    v_asset_version,
    p_client_updated_at,
    v_now
  )
  on conflict (user_id, block_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    watched_ranges = case when user_video_progress.asset_version is distinct from excluded.asset_version then '[]'::jsonb else user_video_progress.watched_ranges end,
    last_observed_position_seconds = case
      when user_video_progress.asset_version is distinct from excluded.asset_version
        then 0
      else user_video_progress.last_observed_position_seconds
    end,
    last_observed_at = case
      when user_video_progress.asset_version is distinct from excluded.asset_version
        then null
      else user_video_progress.last_observed_at
    end,
    checkpoint_client_updated_at = excluded.checkpoint_client_updated_at,
    asset_version = excluded.asset_version,
    updated_at = v_now;
  return jsonb_build_object('saved', true, 'stale', false, 'positionSeconds', p_position_seconds);
end;
$$;
revoke all on function public.fn_checkpoint_video_playback(uuid, uuid, numeric, numeric, timestamptz) from public, anon;
grant execute on function public.fn_checkpoint_video_playback(uuid, uuid, numeric, numeric, timestamptz) to authenticated;

-- A checkpoint can arrive before an already queued observation. Keep the
-- checkpoint position as a resume hint without treating it as trusted
-- watched coverage or as the server-time observation baseline.
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
  v_checkpoint_client_updated_at timestamptz;
  v_resume_position numeric;
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
  select position_seconds,
         watched_ranges,
         last_observed_position_seconds,
         last_observed_at,
         asset_version,
         checkpoint_client_updated_at
    into v_resume_position,
         v_ranges,
         v_last_position,
         v_last_at,
         v_stored_asset_version,
         v_checkpoint_client_updated_at
  from public.user_video_progress
  where user_id = p_user_id and block_id = p_block_id
  for update;
  if v_stored_asset_version is distinct from v_asset_version then
    v_ranges := '[]'::jsonb;
    v_resume_position := null;
    v_last_position := null;
    v_last_at := null;
    v_checkpoint_client_updated_at := null;
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
      or (
        v_last_at is null
        and p_observed_from > 1
        and (
          v_checkpoint_client_updated_at is null
          or (
            abs(p_observed_from - coalesce(v_resume_position, 0)) > 1
            and abs(p_observed_to - coalesce(v_resume_position, 0)) > 1
          )
        )
      )
      or (
        v_last_at is not null
        and abs(p_observed_from - v_last_position) > 1
      )
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
      select *, sum(new_group) over (order by range_start, range_end) as group_id
      from marked
    ) numbered
    group by group_id
  )
  select coalesce(
           jsonb_agg(jsonb_build_array(range_start, range_end) order by range_start),
           '[]'::jsonb
         ),
         coalesce(sum(range_end - range_start), 0)
    into v_ranges, v_watched
  from grouped;

  v_completed := v_watched / v_duration >= 0.9;
  insert into public.user_video_progress (
    user_id, block_id, position_seconds, duration_seconds, watched_ranges,
    last_observed_position_seconds, last_observed_at, asset_version,
    checkpoint_client_updated_at, updated_at
  ) values (
    p_user_id, p_block_id, v_position, v_duration, v_ranges,
    v_position, v_now, v_asset_version, null, v_now
  ) on conflict (user_id, block_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    watched_ranges = excluded.watched_ranges,
    last_observed_position_seconds = excluded.last_observed_position_seconds,
    last_observed_at = excluded.last_observed_at,
    checkpoint_client_updated_at = case
      when user_video_progress.asset_version is distinct from excluded.asset_version
        then null
      else user_video_progress.checkpoint_client_updated_at
    end,
    asset_version = excluded.asset_version,
    updated_at = v_now;

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
    where user_block_progress.asset_version is distinct from excluded.asset_version;
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
