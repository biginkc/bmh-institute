-- BMH Institute: auth rate limits (HARDEN-06).
-- Forgot-password and set-password requests need a durable server-side
-- throttle before they reach Supabase auth. The application checks two
-- independent counters: per IP and per email. Forgot-password breaches
-- return silent success to preserve account-enumeration resistance.
-- Set-password breaches return a retry message because the user already
-- has a recovery session.
--
-- The table is intentionally service-role-only. Learner and admin browser
-- sessions do not read or write counters directly. The SECURITY DEFINER
-- function performs an atomic consume operation and prunes expired windows
-- opportunistically on every call.

create type public.auth_rate_limit_key_type as enum ('ip', 'email');

create table public.auth_rate_limits (
  key_type public.auth_rate_limit_key_type not null,
  key_value text not null,
  window_start timestamptz not null,
  count integer not null default 1 check (count > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key_type, key_value, window_start)
);

alter table public.auth_rate_limits enable row level security;

create index idx_auth_rate_limits_lookup
  on public.auth_rate_limits (key_type, key_value, expires_at);

create trigger auth_rate_limits_set_updated_at before update on public.auth_rate_limits
  for each row execute function public.set_updated_at();

create or replace function public.fn_check_and_consume_rate_limit(
  p_key_type public.auth_rate_limit_key_type,
  p_key_value text,
  p_threshold integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_expires_at timestamptz;
  v_count integer;
begin
  if p_threshold < 1 then
    raise exception 'p_threshold must be at least 1';
  end if;
  if p_window_seconds < 1 then
    raise exception 'p_window_seconds must be at least 1';
  end if;

  delete from public.auth_rate_limits
    where expires_at <= v_now;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_expires_at := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.auth_rate_limits (
    key_type,
    key_value,
    window_start,
    count,
    expires_at
  )
  values (
    p_key_type,
    p_key_value,
    v_window_start,
    1,
    v_expires_at
  )
  on conflict (key_type, key_value, window_start)
  do update set
    count = public.auth_rate_limits.count + 1,
    expires_at = excluded.expires_at
  returning count into v_count;

  allowed := v_count <= p_threshold;
  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (v_expires_at - v_now)))::integer
  );
  return next;
end;
$$;

revoke all on function public.fn_check_and_consume_rate_limit(
  public.auth_rate_limit_key_type,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.fn_check_and_consume_rate_limit(
  public.auth_rate_limit_key_type,
  text,
  integer,
  integer
) to service_role;
