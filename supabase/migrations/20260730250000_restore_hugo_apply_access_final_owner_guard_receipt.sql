-- Follow-up repair for 20260730240000_restore_hardened_hugo_functions.sql.
--
-- That migration restored public.hugo_apply_access to its
-- 20260729050000_hugo_verified_identity_and_orphan_delete_guard.sql body,
-- but the incident-affected production deployment had already received a
-- LATER, additive patch from
-- 20260729141000_hugo_post_merge_security_closure.sql: a begin/exception
-- wrapper around the call into hugo_apply_access_unhashed that catches the
-- two known final-owner check_violation messages raised by
-- fn_prevent_last_owner_deletion (trigger on public.profiles) and
-- fn_hugo_prevent_last_usable_owner_grant (trigger on
-- public.hugo_access_grants), and converts them into a normalized
-- final_owner_guard receipt via fn_hugo_store_guard_failure instead of
-- letting the raw exception abort the caller's transaction.
--
-- 20260730240000 re-issued the pre-141000 body verbatim, which silently
-- dropped that wrapper. Any legitimate final-owner-guard trip (for example:
-- suspending/expiring an owner while a peer owner's profile.status is
-- nominally 'active' but not "usable" -- the exact case the preflight check
-- earlier in this function cannot see, which is why the trigger exists as
-- the last line of defence) now raises an uncaught PostgreSQL exception
-- instead of returning {ok:false, error_code:'final_owner_guard'}. That is
-- what supabase/tests/057_hugo_access_authorization_hardening.sql:438
-- ("lifecycle RPC failed to remove the test owner expiry") observed as
-- `ERROR: Cannot remove the final usable Institute owner.` in CI.
--
-- This migration re-applies the 20260729141000 patch's exact effect via the
-- same drift-checking pg_get_functiondef + string-replace technique, so it
-- fails closed instead of silently re-diverging if hugo_apply_access's
-- installed source has changed again since 20260730240000. It does not
-- touch fn_prevent_last_owner_deletion, fn_hugo_prevent_last_usable_owner_grant,
-- or any other function's body, and it does not weaken either guard: both
-- triggers still unconditionally raise before any row is written when a
-- final usable owner would be lost; only the caller's handling of that raise
-- changes, exactly as it did in production prior to the incident.

begin;

set local lock_timeout = '10s';

do $migration$
declare
  v_source text;
  v_old text := $old$
  perform public.hugo_apply_access_unhashed(
    p_operation_id,
    p_email,
    p_role,
    v_effective_config,
    p_status,
    v_effective_access_expires_at,
    p_app_user_id
  );
$old$;
  v_new text := $new$
  begin
    perform public.hugo_apply_access_unhashed(
      p_operation_id,
      p_email,
      p_role,
      v_effective_config,
      p_status,
      v_effective_access_expires_at,
      p_app_user_id
    );
  exception when check_violation then
    if sqlerrm in (
      'Cannot remove the final usable Institute owner.',
      'Cannot remove the final usable Institute owner grant.'
    ) then
      return public.fn_hugo_store_guard_failure(
        p_operation_id,
        case
          when p_status = 'suspended' then 'suspend'
          when p_status = 'revoked' then 'revoke'
          else 'grant'
        end,
        v_email,
        v_hash,
        p_role,
        v_config,
        p_status,
        p_access_expires_at,
        p_app_user_id,
        false,
        'final_owner_guard',
        'The final usable Institute owner cannot lose access, be demoted, or receive an expiry.'
      );
    end if;
    raise;
  end;
$new$;
begin
  v_source := pg_get_functiondef(
    'public.hugo_apply_access(uuid,text,text,jsonb,text,timestamptz,text)'::regprocedure
  );
  if strpos(v_source, v_new) > 0 then
    -- Already patched (for example on a database that skipped 20260730240000
    -- entirely, or was fixed by a concurrent apply). Nothing to do.
    return;
  end if;
  if strpos(v_source, v_old) = 0 then
    raise exception
      'Hugo apply-access source definition drifted; refusing patch.'
      using errcode = '55000';
  end if;
  v_source := replace(v_source, v_old, v_new);
  if strpos(v_source, v_old) > 0
     or strpos(v_source, v_new) = 0 then
    raise exception
      'Hugo apply-access source replacement failed.'
      using errcode = '55000';
  end if;
  execute v_source;
end;
$migration$;

revoke all on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.hugo_apply_access(
  uuid, text, text, jsonb, text, timestamptz, text
) to service_role;

commit;
