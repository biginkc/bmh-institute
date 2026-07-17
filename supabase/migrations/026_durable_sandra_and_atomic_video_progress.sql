-- Make course-completion delivery durable and video playback accounting atomic.
-- The application may perform the external Sandra PUT, but it cannot directly
-- write either delivery state or completion-bearing video progress.

set lock_timeout = '10s';

create table if not exists public.sandra_course_completion_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  completed_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'delivering', 'acknowledged')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text,
  acknowledged_at timestamptz,
  remote_outcome_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table public.sandra_course_completion_deliveries enable row level security;
revoke all on public.sandra_course_completion_deliveries
  from public, anon, authenticated;
grant select, insert, update on public.sandra_course_completion_deliveries
  to service_role;

-- Progress credit is scoped to the exact authored video path and duration.
-- Imported assets use immutable content-addressed paths, so replacing a cut
-- cannot inherit the prior cut's partial watched ranges.
alter table public.user_video_progress
  add column if not exists asset_version text;
update public.user_video_progress progress
set asset_version = coalesce(
  nullif(block.content ->> 'file_path', '')
    || '#duration=' || coalesce(block.content ->> 'duration_seconds', ''),
  'legacy-block:' || progress.block_id::text
)
from public.content_blocks block
where block.id = progress.block_id
  and progress.asset_version is null;
alter table public.user_video_progress
  alter column asset_version set not null;

create or replace function public.trg_enqueue_sandra_course_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_completed_at timestamptz;
begin
  select m.course_id into v_course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = new.lesson_id;
  if v_course_id is null
    or not public.fn_course_is_complete(new.user_id, v_course_id)
  then
    return new;
  end if;

  v_completed_at := public.fn_course_completed_at(new.user_id, v_course_id);
  if v_completed_at is null then return new; end if;
  insert into public.sandra_course_completion_deliveries (
    user_id, course_id, completed_at, payload
  ) values (
    new.user_id,
    v_course_id,
    v_completed_at,
    jsonb_build_object(
      'userId', new.user_id::text,
      'courseId', v_course_id::text,
      'completedAt', v_completed_at
    )
  ) on conflict (user_id, course_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_sandra_course_completion
  on public.user_lesson_completions;
create trigger trg_enqueue_sandra_course_completion
after insert on public.user_lesson_completions
for each row execute function public.trg_enqueue_sandra_course_completion();
revoke all on function public.trg_enqueue_sandra_course_completion()
  from public, anon, authenticated;

create or replace function public.fn_claim_sandra_course_completion_delivery(
  p_user_id uuid,
  p_course_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
  v_delivery public.sandra_course_completion_deliveries%rowtype;
  v_payload jsonb;
  v_claimed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sandra delivery claim requires the service role.';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Sandra delivery payload must be an object.';
  end if;

  if not public.fn_course_is_complete(p_user_id, p_course_id) then
    raise exception 'Course is not complete.';
  end if;
  v_completed_at := public.fn_course_completed_at(p_user_id, p_course_id);
  if v_completed_at is null then
    raise exception 'Course completion evidence not found.';
  end if;

  -- Identity and completion time come from trusted database state. Once the
  -- unique delivery exists its payload stays immutable across every retry.
  v_payload := p_payload || jsonb_build_object(
    'userId', p_user_id::text,
    'courseId', p_course_id::text,
    'completedAt', v_completed_at
  );
  insert into public.sandra_course_completion_deliveries as existing (
    user_id, course_id, completed_at, payload
  ) values (
    p_user_id, p_course_id, v_completed_at, v_payload
  ) on conflict (user_id, course_id) do update set
    payload = case
      when existing.status = 'pending' and existing.attempt_count = 0
        then excluded.payload
      else existing.payload
    end,
    updated_at = case
      when existing.status = 'pending' and existing.attempt_count = 0
        then clock_timestamp()
      else existing.updated_at
    end;

  select * into v_delivery
  from public.sandra_course_completion_deliveries
  where user_id = p_user_id and course_id = p_course_id
  for update;

  if v_delivery.status = 'acknowledged' then
    null;
  elsif v_delivery.status = 'delivering'
    and v_delivery.last_attempt_at >= clock_timestamp() - interval '5 minutes'
  then
    -- Another request owns the fresh lease. The deterministic PUT remains a
    -- second line of defense, but callers should not send concurrently.
    null;
  else
    update public.sandra_course_completion_deliveries
    set status = 'delivering',
        attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(),
        last_error = null,
        updated_at = clock_timestamp()
    where id = v_delivery.id
    returning * into v_delivery;
    v_claimed := true;
  end if;

  return jsonb_build_object(
    'payload', v_delivery.payload,
    'status', v_delivery.status,
    'claimed', v_claimed,
    'attemptCount', v_delivery.attempt_count,
    'remoteOutcomeId', v_delivery.remote_outcome_id
  );
end;
$$;

create or replace function public.fn_settle_sandra_course_completion_delivery(
  p_user_id uuid,
  p_course_id uuid,
  p_attempt_count integer,
  p_acknowledged boolean,
  p_error text default null,
  p_remote_outcome_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sandra delivery settlement requires the service role.';
  end if;
  if p_attempt_count < 1 then
    raise exception 'Delivery attempt is invalid.';
  end if;

  if p_acknowledged then
    -- A delayed success is still authoritative. Sandra's PUT is idempotent, so
    -- a later failed retry must never erase an earlier acknowledgement.
    update public.sandra_course_completion_deliveries
    set status = 'acknowledged',
        acknowledged_at = coalesce(acknowledged_at, clock_timestamp()),
        remote_outcome_id = coalesce(p_remote_outcome_id, remote_outcome_id),
        last_error = null,
        updated_at = clock_timestamp()
    where user_id = p_user_id
      and course_id = p_course_id
      and status <> 'acknowledged';
  else
    update public.sandra_course_completion_deliveries
    set status = 'pending',
        last_error = left(coalesce(nullif(p_error, ''), 'request_failed'), 2000),
        updated_at = clock_timestamp()
    where user_id = p_user_id
      and course_id = p_course_id
      and status <> 'acknowledged'
      and attempt_count = p_attempt_count;
  end if;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.fn_claim_sandra_course_completion_delivery(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_settle_sandra_course_completion_delivery(uuid, uuid, integer, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_claim_sandra_course_completion_delivery(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fn_settle_sandra_course_completion_delivery(uuid, uuid, integer, boolean, text, text)
  to service_role;

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
  if auth.role() <> 'service_role' then
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

  select cb.lesson_id, cb.content
    into v_lesson_id, v_content
  from public.content_blocks cb
  where cb.id = p_block_id and cb.block_type = 'video';
  if v_lesson_id is null then
    raise exception 'Video block not found.';
  end if;
  if jsonb_typeof(v_content -> 'duration_seconds') is distinct from 'number' then
    raise exception 'Video asset is missing an authored duration.';
  end if;
  v_duration := (v_content ->> 'duration_seconds')::numeric;
  if v_duration <= 0 then
    raise exception 'Video asset is missing an authored duration.';
  end if;
  if nullif(v_content ->> 'file_path', '') is null then
    raise exception 'Video asset is missing an immutable file path.';
  end if;
  v_asset_version := (v_content ->> 'file_path')
    || '#duration=' || (v_content ->> 'duration_seconds');
  if abs(v_duration - p_duration_seconds) > 2 then
    raise exception 'Video duration does not match the lesson asset.';
  end if;
  if p_position_seconds > v_duration + 1 then
    raise exception 'Video position does not match the lesson asset.';
  end if;
  if not public.fn_lesson_is_unlocked(p_user_id, v_lesson_id) then
    raise exception 'Complete the prerequisite lessons first.';
  end if;

  -- The advisory lock closes the no-row insertion race; FOR UPDATE serializes
  -- every subsequent update to the concrete learner/block progress row.
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
      jsonb_build_array(greatest(0, p_observed_from), least(v_duration, p_observed_to))
    );
    v_position := least(v_duration, p_observed_to);
  else
    v_position := least(v_duration, p_position_seconds);
  end if;

  -- Normalize and transitively merge every trusted range. The running maximum
  -- prevents overlapping concurrent observations from losing credited time.
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
    insert into public.user_block_progress (user_id, block_id)
    values (p_user_id, p_block_id)
    on conflict (user_id, block_id) do nothing;
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

revoke all on function public.fn_record_video_playback(uuid, uuid, text, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.fn_record_video_playback(uuid, uuid, text, numeric, numeric, numeric, numeric)
  to authenticated, service_role;
