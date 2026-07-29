-- Close the remaining Hugo authorization gaps without forcing the strict
-- grant cutover before the reviewed legacy-profile backfill exists.
--
-- The default remains additive: an active legacy profile with no grant row is
-- usable, while any suspended, revoked, expired, or delete-prepared grant is
-- denied. A service-role-only audited RPC can enable strict enforcement after
-- every profile has an exact connector grant. In strict mode, no row denies.

set lock_timeout = '10s';

create table public.hugo_access_settings (
  singleton boolean primary key default true check (singleton),
  enforce_grants boolean not null default false,
  changed_at timestamptz not null default now(),
  changed_operation_id uuid
);

insert into public.hugo_access_settings (singleton, enforce_grants)
values (true, false)
on conflict (singleton) do nothing;

create table public.hugo_access_enforcement_changes (
  operation_id uuid primary key,
  previous_enforce_grants boolean not null,
  enforce_grants boolean not null,
  changed_at timestamptz not null default now()
);

alter table public.hugo_access_settings enable row level security;
alter table public.hugo_access_enforcement_changes enable row level security;
revoke all on table public.hugo_access_settings
  from public, anon, authenticated, service_role;
revoke all on table public.hugo_access_enforcement_changes
  from public, anon, authenticated, service_role;

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
      and grant_row.role = profile.system_role
      and not grant_row.prepared_for_delete
      and (
        grant_row.access_expires_at is null
        or grant_row.access_expires_at > now()
      )
  );
$$;

revoke all on function public.fn_hugo_grant_row_is_active(uuid)
  from public, anon, authenticated, service_role;

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

-- Keep security-definer read helpers on the same active-access boundary as
-- table policies. This prevents an authenticated RPC from bypassing the
-- restrictive table policy by reading as its owner.
create or replace function public.fn_can_read_user_state(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'service_role'
    or (
      public.fn_hugo_access_is_active(auth.uid())
      and exists (
        select 1
        from public.profiles actor
        where actor.id = auth.uid()
          and actor.status = 'active'
          and (
            p_user_id = actor.id
            or actor.system_role in ('owner', 'admin')
          )
      )
    );
$$;

revoke all on function public.fn_can_read_user_state(uuid)
  from public, anon;
grant execute on function public.fn_can_read_user_state(uuid)
  to authenticated, service_role;

create or replace function public.fn_hugo_owner_has_nonexpiring_grant(
  p_user_id uuid
)
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
      and profile.system_role = 'owner'
      and profile.status = 'active'
      and lower(btrim(grant_row.email)) = lower(btrim(profile.email))
      and grant_row.app_user_id = profile.id::text
      and grant_row.role = 'owner'
      and grant_row.desired_status = 'active'
      and not grant_row.prepared_for_delete
      and grant_row.access_expires_at is null
  );
$$;

revoke all on function public.fn_hugo_owner_has_nonexpiring_grant(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.fn_hugo_owner_is_usable(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.system_role = 'owner'
      and profile.status = 'active'
      and (
        public.fn_hugo_owner_has_nonexpiring_grant(profile.id)
        or (
          exists (
            select 1
            from public.hugo_access_settings setting
            where setting.singleton
              and not setting.enforce_grants
          )
          and not exists (
            select 1
            from public.hugo_access_grants identity_grant
            where identity_grant.user_id = profile.id
              or lower(btrim(identity_grant.email)) =
                lower(btrim(profile.email))
          )
        )
      )
  );
$$;

revoke all on function public.fn_hugo_owner_is_usable(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.hugo_set_access_enforcement(
  p_operation_id uuid,
  p_enforce_grants boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.hugo_access_enforcement_changes%rowtype;
  v_previous boolean;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );

  if p_operation_id is null or p_enforce_grants is null then
    raise exception 'Hugo enforcement requires an operation id and boolean state.'
      using errcode = '22023';
  end if;

  select * into v_existing
  from public.hugo_access_enforcement_changes
  where operation_id = p_operation_id;
  if found then
    if v_existing.enforce_grants is distinct from p_enforce_grants then
      raise exception 'Hugo enforcement operation id was reused with a different state.'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'operation_id', v_existing.operation_id,
      'previous_enforce_grants', v_existing.previous_enforce_grants,
      'enforce_grants', v_existing.enforce_grants,
      'changed_at', v_existing.changed_at
    );
  end if;

  select setting.enforce_grants into v_previous
  from public.hugo_access_settings setting
  where setting.singleton
  for update;
  if not found then
    raise exception 'Hugo enforcement setting is missing.'
      using errcode = '55000';
  end if;

  if p_enforce_grants and exists (
    select 1
    from public.profiles profile
    left join public.hugo_access_grants grant_row
      on grant_row.user_id = profile.id
    where grant_row.user_id is null
      or grant_row.app_user_id is distinct from profile.id::text
      or lower(btrim(grant_row.email)) is distinct from lower(btrim(profile.email))
      or (
        grant_row.desired_status <> 'revoked'
        and grant_row.role is distinct from profile.system_role
      )
  ) then
    raise exception 'Hugo grant backfill is incomplete or does not match Institute identity state.'
      using errcode = '55000';
  end if;

  if p_enforce_grants and not exists (
    select 1
    from public.profiles profile
    where profile.system_role = 'owner'
      and public.fn_hugo_owner_has_nonexpiring_grant(profile.id)
  ) then
    raise exception 'Strict Hugo enforcement requires at least one active, non-expiring Institute owner.'
      using errcode = '23514';
  end if;

  insert into public.hugo_access_enforcement_changes (
    operation_id,
    previous_enforce_grants,
    enforce_grants
  ) values (
    p_operation_id,
    v_previous,
    p_enforce_grants
  );

  update public.hugo_access_settings
  set enforce_grants = p_enforce_grants,
      changed_at = now(),
      changed_operation_id = p_operation_id
  where singleton;

  return jsonb_build_object(
    'operation_id', p_operation_id,
    'previous_enforce_grants', v_previous,
    'enforce_grants', p_enforce_grants,
    'changed_at', now()
  );
end;
$$;

revoke all on function public.hugo_set_access_enforcement(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.hugo_set_access_enforcement(uuid, boolean)
  to service_role;

comment on function public.hugo_set_access_enforcement(uuid, boolean) is
  'Audited service-role-only cutover for strict Hugo grant enforcement; enabling requires an exact profile backfill and one usable owner.';

-- A restrictive policy is ANDed with the existing permissive policies. Add
-- one to every current public RLS table so self, learner, reviewer, and admin
-- policy paths cannot drift around the Hugo lifecycle boundary.
do $$
declare
  v_table record;
begin
  for v_table in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
    order by relation.relname
  loop
    execute format(
      'drop policy if exists hugo_active_authenticated_gate on %I.%I',
      v_table.schema_name,
      v_table.table_name
    );
    execute format(
      'create policy hugo_active_authenticated_gate on %I.%I as restrictive for all to authenticated using ((select public.fn_hugo_access_is_active(auth.uid()))) with check ((select public.fn_hugo_access_is_active(auth.uid())))',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end;
$$;

drop policy if exists hugo_active_authenticated_gate on storage.objects;
create policy hugo_active_authenticated_gate
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select public.fn_hugo_access_is_active(auth.uid())))
  with check ((select public.fn_hugo_access_is_active(auth.uid())));

-- Keep grant-table mutations behind the frozen public lifecycle RPCs. This
-- second lock is deliberately narrower than the global lifecycle lock so an
-- unrelated enforcement-setting call cannot authorize a direct table write.
create or replace function public.hugo_apply_access(
  p_operation_id uuid,
  p_email text,
  p_role text,
  p_config jsonb,
  p_status text,
  p_access_expires_at timestamptz,
  p_app_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_config jsonb := public.fn_hugo_canonical_apply_config(p_config);
  v_hash text;
  v_existing_hash text;
  v_existing_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_apply_access',
    public.fn_hugo_email_fingerprint(v_email),
    p_role,
    v_config,
    p_status,
    to_jsonb(p_access_expires_at),
    p_app_user_id
  );
  select request_hash, receipt into v_existing_hash, v_existing_receipt
  from public.hugo_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_receipt(
        p_operation_id, p_app_user_id, p_role, v_config, p_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null, false,
        'operation_id_reused',
        'Operation id was already used for a different request.'
      );
    end if;
    return v_existing_receipt;
  end if;

  return public.hugo_apply_access_unhashed(
    p_operation_id, p_email, p_role, p_config, p_status,
    p_access_expires_at, p_app_user_id
  );
end;
$$;

create or replace function public.hugo_prepare_pristine_delete(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_existing_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = 'invalid_parameter_value';
  end if;
  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_prepare_pristine_delete',
    public.fn_hugo_email_fingerprint(v_email),
    null, '{}'::jsonb, null, null, null
  );
  select request_hash, receipt into v_existing_hash, v_existing_receipt
  from public.hugo_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_receipt(
        p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
        null, '{}'::jsonb, 'missing', null, null, false,
        'operation_id_reused',
        'Operation id was already used for a different request.'
      );
    end if;
    return v_existing_receipt;
  end if;
  return public.hugo_prepare_pristine_delete_unhashed(p_operation_id, p_email);
end;
$$;

create or replace function public.hugo_delete_identity(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_existing_receipt jsonb;
begin
  perform public.fn_hugo_require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-grant-mutation-rpc-v1', 0)
  );
  if p_operation_id is null then
    raise exception 'operation_id is required.'
      using errcode = 'invalid_parameter_value';
  end if;
  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_delete_identity',
    public.fn_hugo_email_fingerprint(v_email),
    null, '{}'::jsonb, null, null, null
  );
  select request_hash, receipt into v_existing_hash, v_existing_receipt
  from public.hugo_access_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_receipt(
        p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
        null, '{}'::jsonb, 'missing', null, null, false,
        'operation_id_reused',
        'Operation id was already used for a different request.'
      );
    end if;
    return v_existing_receipt;
  end if;
  return public.hugo_delete_identity_unhashed(p_operation_id, p_email);
end;
$$;

revoke all on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.hugo_prepare_pristine_delete(uuid, text)
  from public, anon, authenticated;
revoke all on function public.hugo_delete_identity(uuid, text)
  from public, anon, authenticated;
grant execute on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) to service_role;
grant execute on function public.hugo_prepare_pristine_delete(uuid, text)
  to service_role;
grant execute on function public.hugo_delete_identity(uuid, text)
  to service_role;

-- Supabase commonly grants service_role broad table privileges through
-- schema defaults. The SECURITY DEFINER lifecycle RPCs do not need those
-- direct privileges, so remove them explicitly.
revoke insert, update, delete, truncate on public.hugo_access_grants
  from service_role;

-- The private delete body predates Auth sign-in as a pristine criterion.
-- Lock the Auth row before the final durable recheck so a concurrent sign-in
-- cannot commit between that check and identity deletion.
do $$
declare
  v_source text;
  v_before_count integer;
  v_after_count integer;
  v_before text :=
    '  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);';
  v_after text :=
    '  perform 1
  from auth.users auth_user
  where auth_user.id = v_profile.id
  for update;
  v_durable := public.fn_hugo_has_durable_activity(v_profile.id);';
begin
  v_source := pg_get_functiondef(
    'public.hugo_delete_identity_unhashed(uuid,text)'::regprocedure
  );
  v_before_count :=
    (length(v_source) - length(replace(v_source, v_before, ''))) /
    length(v_before);
  v_after_count :=
    (length(v_source) - length(replace(v_source, v_after, ''))) /
    length(v_after);

  if v_after_count = 1 and v_before_count = 1 then
    null;
  elsif v_after_count = 0 and v_before_count = 1 then
    v_source := replace(v_source, v_before, v_after);
    execute v_source;
  else
    raise exception 'Hugo delete RPC durable recheck insertion point drifted';
  end if;
end;
$$;

-- The profile trigger and grant trigger share the lifecycle advisory lock.
-- Two concurrent transitions therefore cannot each count the other owner and
-- remove both. The grant trigger also covers direct SQL outside the RPCs.
create or replace function public.fn_prevent_last_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_usable boolean;
  v_new_usable boolean := false;
begin
  if old.system_role <> 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('hugo-institute-privileged-lifecycle-v1', 0)
  );
  v_old_usable := public.fn_hugo_owner_is_usable(old.id);

  if tg_op = 'UPDATE' then
    v_new_usable :=
      new.system_role = 'owner'
      and new.status = 'active'
      and (
        exists (
          select 1
          from public.hugo_access_grants grant_row
          where grant_row.user_id = old.id
            and lower(btrim(grant_row.email)) =
              lower(btrim(new.email))
            and grant_row.app_user_id = old.id::text
            and grant_row.role = 'owner'
            and grant_row.desired_status = 'active'
            and not grant_row.prepared_for_delete
            and grant_row.access_expires_at is null
        )
        or (
          exists (
            select 1
            from public.hugo_access_settings setting
            where setting.singleton and not setting.enforce_grants
          )
          and not exists (
            select 1
            from public.hugo_access_grants identity_grant
            where identity_grant.user_id = old.id
              or lower(btrim(identity_grant.email)) =
                lower(btrim(new.email))
          )
        )
      );
  end if;

  if v_old_usable and not v_new_usable and not exists (
    select 1
    from public.profiles other_profile
    where other_profile.id <> old.id
      and other_profile.system_role = 'owner'
      and public.fn_hugo_owner_is_usable(other_profile.id)
  ) then
    raise exception 'Cannot remove the final usable Institute owner.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_owner_deletion on public.profiles;
create trigger trg_prevent_last_owner_deletion
before delete or update of email, system_role, status on public.profiles
for each row execute function public.fn_prevent_last_owner_deletion();

create or replace function public.fn_hugo_prevent_last_usable_owner_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_usable boolean;
  v_new_usable boolean := false;
begin
  -- Inserts are ordinarily available only inside the service-role lifecycle
  -- RPC because direct service-role table privileges are revoked. The trigger
  -- still guards a database-owner insert that would replace the sole dormant
  -- legacy owner with an expiring or otherwise unusable grant.
  if tg_op = 'INSERT' then
    v_old_usable := public.fn_hugo_owner_is_usable(new.user_id);
    select exists (
      select 1
      from public.profiles profile
      where profile.id = new.user_id
        and profile.system_role = 'owner'
        and profile.status = 'active'
        and lower(btrim(new.email)) = lower(btrim(profile.email))
        and new.app_user_id = profile.id::text
        and new.role = 'owner'
        and new.desired_status = 'active'
        and not new.prepared_for_delete
        and new.access_expires_at is null
    ) into v_new_usable;

    if v_old_usable and not v_new_usable and not exists (
      select 1
      from public.profiles other_profile
      where other_profile.id <> new.user_id
        and other_profile.system_role = 'owner'
        and public.fn_hugo_owner_is_usable(other_profile.id)
    ) then
      raise exception 'Cannot remove the final usable Institute owner grant.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- Grant mutations are RPC-only. The lifecycle RPC takes this transaction
  -- advisory lock in a statement before it reaches the grant table. Requiring
  -- the already-held lock rejects direct SQL before a statement snapshot can
  -- race another direct owner removal.
  if not exists (
    select 1
    from pg_catalog.pg_locks held_lock
    cross join lateral (
      select hashtextextended(
        'hugo-institute-grant-mutation-rpc-v1',
        0
      )::bigint as lock_key
    ) expected
    where held_lock.locktype = 'advisory'
      and held_lock.pid = pg_backend_pid()
      and held_lock.granted
      and held_lock.objsubid = 1
      and held_lock.classid::bigint =
        ((expected.lock_key >> 32) & 4294967295::bigint)
      and held_lock.objid::bigint =
        (expected.lock_key & 4294967295::bigint)
  ) then
    raise exception 'Hugo owner grants must be changed through a lifecycle RPC.'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.profiles profile
    where profile.id = old.user_id
      and profile.system_role = 'owner'
      and profile.status = 'active'
      and lower(btrim(old.email)) = lower(btrim(profile.email))
      and old.app_user_id = profile.id::text
      and old.role = 'owner'
      and old.desired_status = 'active'
      and not old.prepared_for_delete
      and old.access_expires_at is null
  ) into v_old_usable;

  if not v_old_usable then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.profiles profile
      where profile.id = new.user_id
        and profile.system_role = 'owner'
        and profile.status = 'active'
        and lower(btrim(new.email)) = lower(btrim(profile.email))
        and new.app_user_id = profile.id::text
        and new.role = 'owner'
        and new.desired_status = 'active'
        and not new.prepared_for_delete
        and new.access_expires_at is null
    ) into v_new_usable;
  end if;

  if not v_new_usable and not exists (
    select 1
    from public.profiles other_profile
    where other_profile.id <> old.user_id
      and other_profile.system_role = 'owner'
      and public.fn_hugo_owner_is_usable(other_profile.id)
  ) then
    raise exception 'Cannot remove the final usable Institute owner grant.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists hugo_access_grants_final_owner_guard
  on public.hugo_access_grants;
create trigger hugo_access_grants_final_owner_guard
before insert or delete or update
on public.hugo_access_grants
for each row execute function public.fn_hugo_prevent_last_usable_owner_grant();

create or replace function public.fn_hugo_prevent_grant_truncate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Hugo access grants cannot be truncated.'
    using errcode = '42501';
end;
$$;

drop trigger if exists hugo_access_grants_prevent_truncate
  on public.hugo_access_grants;
create trigger hugo_access_grants_prevent_truncate
before truncate on public.hugo_access_grants
for each statement execute function public.fn_hugo_prevent_grant_truncate();

revoke all on function public.fn_hugo_prevent_last_usable_owner_grant()
  from public, anon, authenticated, service_role;
revoke all on function public.fn_hugo_prevent_grant_truncate()
  from public, anon, authenticated, service_role;

-- Discover durable identity references from the installed foreign-key graph.
-- Only connector state and replaceable role-group membership are excluded.
-- Every other reference, including attribution columns with ON DELETE SET
-- NULL, makes an identity non-pristine.
create or replace function public.fn_hugo_profile_reference_inventory(
  p_user_id uuid
)
returns table(reference text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reference record;
  v_exists boolean;
begin
  for v_reference in
    select
      child_namespace.nspname as schema_name,
      child_relation.relname as table_name,
      child_attribute.attname as column_name,
      child_namespace.nspname || '.' ||
        child_relation.relname || '.' ||
        child_attribute.attname as reference_key
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class parent_relation
      on parent_relation.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace parent_namespace
      on parent_namespace.oid = parent_relation.relnamespace
    join pg_catalog.pg_class child_relation
      on child_relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace child_namespace
      on child_namespace.oid = child_relation.relnamespace
    join unnest(constraint_row.conkey) with ordinality
      as child_key(attnum, position) on true
    join unnest(constraint_row.confkey) with ordinality
      as parent_key(attnum, position)
      on parent_key.position = child_key.position
    join pg_catalog.pg_attribute child_attribute
      on child_attribute.attrelid = child_relation.oid
      and child_attribute.attnum = child_key.attnum
    join pg_catalog.pg_attribute parent_attribute
      on parent_attribute.attrelid = parent_relation.oid
      and parent_attribute.attnum = parent_key.attnum
    where constraint_row.contype = 'f'
      and parent_namespace.nspname = 'public'
      and parent_relation.relname = 'profiles'
      and parent_attribute.attname = 'id'
      and child_namespace.nspname = 'public'
      and (
        child_namespace.nspname || '.' ||
        child_relation.relname || '.' ||
        child_attribute.attname
      ) not in (
        'public.user_role_groups.user_id',
        'public.hugo_access_grants.user_id'
      )
    order by reference_key
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    ) into v_exists using p_user_id;
    if v_exists then
      reference := v_reference.reference_key;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.fn_hugo_has_durable_activity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_user_id
      and auth_user.last_sign_in_at is not null
  )
  or exists (
    select 1
    from storage.objects object_row
    where object_row.bucket_id = 'submissions'
      and (storage.foldername(object_row.name))[1] = p_user_id::text
  )
  or exists (
    select 1
    from public.fn_hugo_profile_reference_inventory(p_user_id)
  );
$$;

comment on function public.fn_hugo_has_durable_activity(uuid) is
  'Pristine-delete guard covering Auth sign-in, owned submission objects, and every current durable public.profiles foreign-key reference.';

revoke all on function public.fn_hugo_profile_reference_inventory(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_hugo_profile_reference_inventory(uuid)
  to service_role;
revoke all on function public.fn_hugo_has_durable_activity(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_hugo_has_durable_activity(uuid)
  to service_role;
