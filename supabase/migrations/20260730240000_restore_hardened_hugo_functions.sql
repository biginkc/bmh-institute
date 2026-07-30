-- Incident repair: on 2026-07-30 11:58:52 UTC an automated production
-- migration reconciliation loop mistook a missing schema_migrations history
-- row for missing content, and re-applied the OLD migration
-- 20260728091000_hugo_access_provisioner.sql directly against production out
-- of order. That file's `create or replace function` statements silently
-- overwrote 6 functions that had since been hardened by later migrations,
-- reverting them to their pre-hardening legacy bodies:
--   - public.hugo_apply_access                 (hardened in 20260729050000)
--   - public.hugo_prepare_pristine_delete       (hardened in 20260729050000)
--   - public.hugo_delete_identity               (hardened in 20260729050000)
--   - public.fn_hugo_access_is_active           (hardened in 20260728230000)
--   - public.fn_hugo_has_durable_activity       (hardened in 20260728230000)
--   - public.fn_prevent_last_owner_deletion     (hardened in 20260728230000)
--
-- Critically, the reverted hugo_apply_access no longer consumes the claim
-- row that hugo_preflight_access_operation (unaffected, still hardened)
-- inserts into private.hugo_access_operation_claims. Every grant therefore
-- left a permanent unconsumed claim, which made the preflight blocking-claim
-- check return identity_provision_in_progress forever for that email.
--
-- This migration re-issues the intended (latest checked-in) bodies for all
-- 6 functions verbatim from their source migrations, forward-only. It does
-- not touch schema_migrations history and does not re-run the old file.
-- Do not re-revert these functions to the 20260728091000 bodies.

begin;

set local lock_timeout = '10s';

-- From 20260728230000_hugo_access_authorization_hardening.sql

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

revoke all on function public.fn_hugo_has_durable_activity(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_hugo_has_durable_activity(uuid)
  to service_role;

-- From 20260729050000_hugo_verified_identity_and_orphan_delete_guard.sql

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
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_config jsonb := public.fn_hugo_canonical_apply_config(p_config);
  v_effective_config jsonb;
  v_effective_access_expires_at timestamptz;
  v_hash text;
  v_existing_hash text;
  v_claim_hash text;
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
      using errcode = '22023';
  end if;
  v_effective_config := case
    when p_status in ('suspended', 'revoked')
      then public.fn_hugo_existing_apply_config(v_config)
    when p_status = 'active'
      then public.fn_hugo_reactivation_apply_config(p_config, v_email)
    else v_config
  end;
  v_effective_access_expires_at := case
    when p_status = 'active'
      then public.fn_hugo_reactivation_access_expires_at(
        v_email,
        p_access_expires_at
      )
    else p_access_expires_at
  end;

  select claim.request_hash
  into v_claim_hash
  from private.hugo_access_operation_claims claim
  where claim.operation_id = p_operation_id
  for update;
  if found then
    v_hash := public.fn_hugo_request_payload_hash(
      'hugo_apply_access',
      public.fn_hugo_email_fingerprint(v_email),
      p_role,
      v_config,
      p_status,
      to_jsonb(p_access_expires_at),
      null
    );
  else
    v_hash := public.fn_hugo_request_payload_hash(
      'hugo_apply_access',
      public.fn_hugo_email_fingerprint(v_email),
      p_role,
      v_config,
      p_status,
      to_jsonb(p_access_expires_at),
      p_app_user_id
    );
  end if;
  if v_claim_hash is not null
     and v_claim_hash is distinct from v_hash then
    return public.fn_hugo_bind_mutation_receipt(
      public.fn_hugo_receipt(
        p_operation_id, p_app_user_id, p_role, v_config, p_status,
        p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
        false, 'operation_id_reused',
        'Operation id was already used for a different request.'
      ),
      p_operation_id,
      v_hash
    );
  end if;
  if v_claim_hash is not null then
    v_hash := v_claim_hash;
  end if;
  select operation_row.request_hash
  into v_existing_hash
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, p_app_user_id, p_role, v_config, p_status,
          p_access_expires_at, null, '{}'::jsonb, 'missing', null, null,
          false, 'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
    end if;
    return public.fn_hugo_bound_operation_receipt(p_operation_id);
  end if;

  if p_status = 'active'
     and public.fn_hugo_active_identity_is_unverified(
       v_email,
       p_app_user_id
     ) then
    return public.fn_hugo_store_guard_failure(
      p_operation_id,
      'grant',
      v_email,
      v_hash,
      p_role,
      v_config,
      p_status,
      p_access_expires_at,
      p_app_user_id,
      false,
      'identity_unverified',
      'The Institute identity email is not verified.'
    );
  end if;

  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', v_hash, true);
  perform public.hugo_apply_access_unhashed(
    p_operation_id,
    p_email,
    p_role,
    v_effective_config,
    p_status,
    v_effective_access_expires_at,
    p_app_user_id
  );
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  update private.hugo_access_operation_claims
  set consumed_at = now()
  where operation_id = p_operation_id;
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$$;

create or replace function public.hugo_prepare_pristine_delete(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_durable boolean;
  v_identity_state text;
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
      using errcode = '22023';
  end if;

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_prepare_pristine_delete',
    public.fn_hugo_email_fingerprint(v_email),
    null,
    '{}'::jsonb,
    null,
    null,
    null
  );
  select operation_row.request_hash
  into v_existing_hash
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
          null, '{}'::jsonb, 'missing', null, null, false,
          'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
    end if;
    return public.fn_hugo_bound_operation_receipt(p_operation_id);
  end if;

  v_identity_state :=
    public.fn_hugo_identity_cardinality_state(v_email);
  if v_identity_state not in ('absent', 'one_to_one') then
    v_durable := public.fn_hugo_email_has_durable_activity(v_email);
    return public.fn_hugo_store_guard_failure(
      p_operation_id,
      'preparePristineDelete',
      v_email,
      v_hash,
      null,
      '{}'::jsonb,
      'revoked',
      null,
      null,
      v_durable,
      case
        when v_durable then 'identity_not_pristine'
        when v_identity_state = 'profile_missing'
          then 'identity_profile_missing'
        else 'ambiguous_identity'
      end,
      case
        when v_durable then
          'The Institute identity has durable business activity.'
        when v_identity_state = 'profile_missing' then
          'The Institute Auth identity has no lifecycle profile.'
        else
          'Institute Auth and profile identities are not one-to-one.'
      end
    );
  end if;

  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', v_hash, true);
  perform public.hugo_prepare_pristine_delete_unhashed(
    p_operation_id,
    p_email
  );
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$$;

create or replace function public.hugo_delete_identity(
  p_operation_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_existing_hash text;
  v_durable boolean;
  v_identity_state text;
  v_receipt jsonb;
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
      using errcode = '22023';
  end if;

  v_hash := public.fn_hugo_request_payload_hash(
    'hugo_delete_identity',
    public.fn_hugo_email_fingerprint(v_email),
    null,
    '{}'::jsonb,
    null,
    null,
    null
  );
  select operation_row.request_hash
  into v_existing_hash
  from public.hugo_access_operations operation_row
  where operation_row.operation_id = p_operation_id;
  if found then
    if v_existing_hash is distinct from v_hash then
      return public.fn_hugo_bind_mutation_receipt(
        public.fn_hugo_receipt(
          p_operation_id, null, null, '{}'::jsonb, 'revoked', null,
          null, '{}'::jsonb, 'missing', null, null, false,
          'operation_id_reused',
          'Operation id was already used for a different request.'
        ),
        p_operation_id,
        v_hash
      );
    end if;
    return public.fn_hugo_bound_operation_receipt(p_operation_id);
  end if;

  v_identity_state :=
    public.fn_hugo_identity_cardinality_state(v_email);
  if v_identity_state not in ('absent', 'one_to_one') then
    v_durable := public.fn_hugo_email_has_durable_activity(v_email);
    return public.fn_hugo_store_guard_failure(
      p_operation_id,
      'deleteIdentity',
      v_email,
      v_hash,
      null,
      '{}'::jsonb,
      'revoked',
      null,
      null,
      v_durable,
      case
        when v_durable then 'identity_not_pristine'
        when v_identity_state = 'profile_missing'
          then 'identity_profile_missing'
        else 'ambiguous_identity'
      end,
      case
        when v_durable then
          'The Institute identity has durable business activity.'
        when v_identity_state = 'profile_missing' then
          'The Institute Auth identity has no lifecycle profile.'
        else
          'Institute Auth and profile identities are not one-to-one.'
      end
    );
  end if;

  perform set_config(
    'hugo.request_operation_id',
    p_operation_id::text,
    true
  );
  perform set_config('hugo.request_hash', v_hash, true);
  perform public.hugo_delete_identity_unhashed(
    p_operation_id,
    p_email
  );
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  v_receipt := public.fn_hugo_bound_operation_receipt(p_operation_id);
  if coalesce((v_receipt->>'ok')::boolean, false)
     and public.fn_hugo_identity_cardinality_state(v_email) <> 'absent'
  then
    raise exception
      'Institute identity deletion left matching Auth or profile state.'
      using errcode = '55000';
  end if;
  return v_receipt;
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

commit;
