-- Hugo owns whether a person may enter Institute. Institute owns the role
-- after the initial profile is provisioned. A later Institute role change
-- must not invalidate an otherwise active Hugo grant.

begin;

set local lock_timeout = '10s';

create or replace function public.fn_hugo_grant_row_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.hugo_access_grants grant_row
      on grant_row.user_id = profile.id
    where profile.id = p_user_id
      and profile.status = 'active'
      and lower(btrim(grant_row.email)) = lower(btrim(profile.email))
      and grant_row.app_user_id = profile.id::text
      and grant_row.desired_status = 'active'
      and grant_row.role is not null
      and not grant_row.prepared_for_delete
      and (
        grant_row.access_expires_at is null
        or grant_row.access_expires_at > now()
      )
  );
$$;

revoke all on function public.fn_hugo_grant_row_is_active(uuid)
  from public, anon, authenticated, service_role;

comment on function public.fn_hugo_grant_row_is_active(uuid) is
  'Returns active Hugo lifecycle access for the exact Institute identity. Institute role changes do not alter access.';

create or replace function public.fn_hugo_access_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select profile.status = 'active'
        and case
          when coalesce((
            select setting.enforce_grants
            from public.hugo_access_settings setting
            where setting.singleton
          ), true)
          then public.fn_hugo_grant_row_is_active(profile.id)
          else not exists (
            select 1
            from public.hugo_access_grants identity_grant
            where identity_grant.user_id = profile.id
              or lower(btrim(identity_grant.email)) =
                lower(btrim(profile.email))
          )
          or public.fn_hugo_grant_row_is_active(profile.id)
        end
      from public.profiles profile
      where profile.id = p_user_id
    ),
    false
  );
$$;

revoke all on function public.fn_hugo_access_is_active(uuid)
  from public, anon;
grant execute on function public.fn_hugo_access_is_active(uuid)
  to authenticated, service_role;

commit;
