-- Unload-safe resume checkpoint. This path never records watched coverage or completion credit.
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
  v_existing_updated_at timestamptz;
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
  select updated_at into v_existing_updated_at from public.user_video_progress
    where user_id = p_user_id and block_id = p_block_id for update;
  if v_existing_updated_at is not null and v_existing_updated_at >= p_client_updated_at then
    return jsonb_build_object('saved', false, 'stale', true);
  end if;
  insert into public.user_video_progress (user_id, block_id, position_seconds, duration_seconds, watched_ranges, last_observed_position_seconds, last_observed_at, asset_version, updated_at)
  values (p_user_id, p_block_id, least(p_position_seconds, (v_content ->> 'duration_seconds')::numeric), (v_content ->> 'duration_seconds')::numeric, '[]'::jsonb, least(p_position_seconds, (v_content ->> 'duration_seconds')::numeric), p_client_updated_at, v_asset_version, p_client_updated_at)
  on conflict (user_id, block_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    watched_ranges = case when user_video_progress.asset_version is distinct from excluded.asset_version then '[]'::jsonb else user_video_progress.watched_ranges end,
    last_observed_position_seconds = excluded.last_observed_position_seconds,
    last_observed_at = excluded.last_observed_at,
    asset_version = excluded.asset_version,
    updated_at = excluded.updated_at;
  return jsonb_build_object('saved', true, 'stale', false, 'positionSeconds', p_position_seconds);
end;
$$;
revoke all on function public.fn_checkpoint_video_playback(uuid, uuid, numeric, numeric, timestamptz) from public, anon;
grant execute on function public.fn_checkpoint_video_playback(uuid, uuid, numeric, numeric, timestamptz) to authenticated;
