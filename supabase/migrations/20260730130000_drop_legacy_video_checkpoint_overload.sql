-- The sequence migration changed the fifth parameter type, which left the
-- timestamp-based checkpoint function as a callable overload. Remove that
-- exact legacy signature without assuming it exists on a clean replay.
do $$
begin
  if to_regprocedure(
    'public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,timestamptz)'
  ) is not null then
    execute 'revoke all on function public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,timestamptz) from public, anon, authenticated, service_role';
    execute 'drop function public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,timestamptz)';
  end if;
end;
$$;

-- Reassert the intended privilege boundary on the surviving sequence path.
revoke all on function public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,bigint)
  from public, anon, service_role;
grant execute on function public.fn_checkpoint_video_playback(uuid,uuid,numeric,numeric,bigint)
  to authenticated;
