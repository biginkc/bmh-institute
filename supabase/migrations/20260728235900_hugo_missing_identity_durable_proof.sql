-- A missing public.profiles row is not proof that the email has no Institute
-- history. Resolve every matching Auth identity first, then reuse the complete
-- durable-activity guard installed by the authorization-hardening migration.

set lock_timeout = '10s';

create or replace function public.fn_hugo_email_has_durable_activity(
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select auth_user.id
    from auth.users auth_user
    where lower(btrim(auth_user.email)) =
      lower(btrim(coalesce(p_email, '')))
    order by auth_user.id
    for update
  loop
    if public.fn_hugo_has_durable_activity(v_user_id) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

comment on function public.fn_hugo_email_has_durable_activity(text) is
  'Private pristine-delete guard that resolves normalized email to every matching Auth identity before checking durable activity.';

revoke all on function public.fn_hugo_email_has_durable_activity(text)
  from public, anon, authenticated, service_role;

-- Keep the request-hash/replay wrappers untouched. Patch only the two private
-- implementations they call after a new request has passed the replay gate.
-- The exact source-shape guards make migration drift fail closed.
do $$
declare
  v_source text;
  v_before_count integer;
  v_after_count integer;
  v_prepare_before text :=
    '  if not found then
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, ''{}''::jsonb, ''revoked'', null,
      null, ''{}''::jsonb, ''missing'', null, null, false, ''identity_missing'',
      ''The Institute identity is not provisioned.'');';
  v_prepare_after text :=
    '  if not found then
    v_durable := public.fn_hugo_email_has_durable_activity(p_email);
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, ''{}''::jsonb, ''revoked'', null,
      null, ''{}''::jsonb, ''missing'', null, v_durable, not v_durable,
      case when v_durable then ''identity_not_pristine'' else null end,
      case when v_durable then
        ''The Institute identity has durable business activity.''
      else null end);';
  v_delete_before text :=
    '  if not found then
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, ''{}''::jsonb, ''revoked'', null,
      null, ''{}''::jsonb, ''missing'', null, null, true, null, null);';
  v_delete_after text :=
    '  if not found then
    v_durable := public.fn_hugo_email_has_durable_activity(p_email);
    v_receipt := public.fn_hugo_receipt(p_operation_id, null, null, ''{}''::jsonb, ''revoked'', null,
      null, ''{}''::jsonb, ''missing'', null, v_durable, not v_durable,
      case when v_durable then ''identity_not_pristine'' else null end,
      case when v_durable then
        ''The Institute identity has durable business activity.''
      else null end);';
begin
  v_source := pg_get_functiondef(
    'public.hugo_prepare_pristine_delete_unhashed(uuid,text)'::regprocedure
  );
  v_before_count :=
    (length(v_source) - length(replace(v_source, v_prepare_before, ''))) /
    length(v_prepare_before);
  v_after_count :=
    (length(v_source) - length(replace(v_source, v_prepare_after, ''))) /
    length(v_prepare_after);

  if v_after_count = 1 and v_before_count = 0 then
    null;
  elsif v_after_count = 0 and v_before_count = 1 then
    v_source := replace(v_source, v_prepare_before, v_prepare_after);
    execute v_source;
  else
    raise exception
      'Hugo missing-profile prepare durable-proof insertion point drifted';
  end if;

  v_source := pg_get_functiondef(
    'public.hugo_delete_identity_unhashed(uuid,text)'::regprocedure
  );
  v_before_count :=
    (length(v_source) - length(replace(v_source, v_delete_before, ''))) /
    length(v_delete_before);
  v_after_count :=
    (length(v_source) - length(replace(v_source, v_delete_after, ''))) /
    length(v_delete_after);

  if v_after_count = 1 and v_before_count = 0 then
    null;
  elsif v_after_count = 0 and v_before_count = 1 then
    v_source := replace(v_source, v_delete_before, v_delete_after);
    execute v_source;
  else
    raise exception
      'Hugo missing-profile delete durable-proof insertion point drifted';
  end if;
end;
$$;
