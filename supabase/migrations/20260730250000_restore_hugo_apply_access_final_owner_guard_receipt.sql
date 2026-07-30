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
-- Round 1 of this fix (still visible in this file's git history) patched the
-- installed source with a substring find/replace: first strpos()/
-- unconditional replace(), then explicit occurrence counting. Codex round 2
-- broke the counting version with a synthetic case: a source whose real call
-- site is already patched to something that is not a byte-exact match for
-- the known patched text, but which also contains the known old call text
-- once more, incidentally, inside a comment. That yields old=1, new=0 in the
-- raw source text -- a combination none of the counting guard's branches
-- recognized as drift -- so it fell through to replace(), which rewrote the
-- comment's stray old text into new text (satisfying the post-replace check:
-- old=0, new=1) while the real, unrecognized call site was left untouched.
-- The migration would have reported success while the function stayed
-- broken. Any substring-based approach on raw source text has this shape of
-- blind spot, because a comment or a string literal is indistinguishable
-- from executable code to a text scan -- counting occurrences more
-- carefully does not close it.
--
-- This version does not scan or edit raw source text at all. It:
--   1. Builds two scratch functions in pg_temp with the exact same
--      signature and attributes as public.hugo_apply_access, from the same
--      literal body text this migration would install (the "new"/patched
--      form) and the same literal body text 20260730240000 installed (the
--      "old"/pre-patch form).
--   2. Deparses all three functions (the installed one and both scratch
--      copies) with pg_get_functiondef, and compares them for EXACT WHOLE-
--      BODY equality after normalizing away only each function's own name/
--      schema (which necessarily differs for the pg_temp copies, since two
--      functions cannot share one name). No normalization touches comments,
--      string literals, or any other part of the body.
--   3. Only when the installed definition is byte-for-byte identical
--      (post-normalization) to the known pre-patch form does it install the
--      patched body, via `execute` of the same literal "new" body text used
--      to build the scratch comparison copy -- so the thing compared and
--      the thing installed cannot drift apart. When the installed
--      definition already matches the known patched form exactly, it
--      returns before touching public.hugo_apply_access at all. Anything
--      else -- including Codex's synthetic case, where a stray comment/
--      literal makes the body byte-different from both known forms --
--      raises and aborts the whole migration transaction.
--
-- The precise no-op criterion (Codex round 3) is: no modification to the
-- live public.hugo_apply_access function OR its privileges. Building the
-- two scratch pg_temp functions is inherent to the comparison -- there is
-- no way to deparse a known-good form without materialising it -- but they
-- are collision-resistant-named (see v_suffix below), created with plain
-- CREATE FUNCTION so a name collision errors instead of silently replacing
-- someone else's session object, and dropped again before this migration
-- branches on the comparison result, so pg_temp itself always ends the
-- transaction exactly as it started. The already-patched branch returns
-- before the `create or replace function public.hugo_apply_access` and
-- before the REVOKE/GRANT that follow it, so a repeated run against an
-- already-patched database issues zero DDL and zero privilege statements
-- against the live function.
--
-- Whole-body equality closes the comment/string-literal hole structurally:
-- there is no way for extra text anywhere in the function (comment, string
-- literal, or otherwise) to make a drifted body equal to one of exactly two
-- known-good strings, because equality requires every byte to match, not
-- just a chosen substring.
--
-- Version sensitivity: pg_get_functiondef's PREAMBLE (the argument list,
-- return type, and attribute clauses) is reconstructed from catalog state
-- and can in principle be formatted differently across PostgreSQL major
-- versions. This migration never hardcodes what that reconstruction looks
-- like -- it only ever compares reconstructions produced by the SAME
-- running server against each other (the installed function vs. the
-- pg_temp scratch copies, deparsed by the same backend in the same
-- transaction). Any version-specific formatting is applied identically to
-- all three sides and cancels out of the comparison. The PL/pgSQL function
-- BODY text (the part between the dollar-quoted delimiters) is not
-- reformatted by pg_get_functiondef at all -- Postgres stores and returns
-- prosrc verbatim for any procedural language -- so the body half of the
-- comparison is exact on every supported major version for that reason too,
-- independent of the self-comparison design. Verified end-to-end on a local
-- PostgreSQL 17 cluster; the CI matrix separately exercises PostgreSQL 15,
-- 16, and 17 against this same migration.

begin;

set local lock_timeout = '10s';

do $migration$
declare
  -- Fixed parameter list shared by the installed function and both scratch
  -- comparison copies, so pg_get_functiondef has nothing to format
  -- differently between them except the name.
  v_args constant text :=
    'p_operation_id uuid, p_email text, p_role text, p_config jsonb, ' ||
    'p_status text, p_access_expires_at timestamptz, ' ||
    'p_app_user_id text default null';
  -- Byte-identical to the body 20260730240000_restore_hardened_hugo_functions.sql
  -- installs for public.hugo_apply_access.
  v_old_body constant text := $oldbody$
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
$oldbody$;
  -- The pre-patch body above, plus the 20260729141000 wrapper: the call
  -- into hugo_apply_access_unhashed is caught for the two known final-owner
  -- check_violation messages and converted into a normalized receipt.
  v_new_body constant text := $newbody$
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
  perform set_config('hugo.request_operation_id', '', true);
  perform set_config('hugo.request_hash', '', true);
  update private.hugo_access_operation_claims
  set consumed_at = now()
  where operation_id = p_operation_id;
  return public.fn_hugo_bound_operation_receipt(p_operation_id);
end;
$newbody$;
  -- Collision-resistant scratch-function names. A fixed name could clobber
  -- (via CREATE OR REPLACE) or, worse, be silently satisfied by some other
  -- session's identically-named pg_temp object; suffixing with randomness
  -- keyed on random(), clock_timestamp(), and this backend's pid makes an
  -- accidental match astronomically unlikely, and CREATE FUNCTION (not
  -- CREATE OR REPLACE) below turns the residual risk into a loud error
  -- instead of a silent overwrite. 16 hex chars is kept short deliberately:
  -- combined with the fixed prefix this stays well under PostgreSQL's
  -- 63-byte identifier limit.
  v_suffix constant text := substr(
    md5(random()::text || clock_timestamp()::text || pg_backend_pid()::text),
    1, 16
  );
  v_old_name constant text := 'hugo_apply_access_expected_old_' || v_suffix;
  v_new_name constant text := 'hugo_apply_access_expected_new_' || v_suffix;
  v_current text;
  v_expected_old text;
  v_expected_new text;
begin
  -- CREATE, not CREATE OR REPLACE: a name collision must error, never
  -- silently replace an object this migration does not own.
  execute format(
    'create function pg_temp.%I(%s) '
    'returns jsonb language plpgsql security definer set search_path = %L as %L',
    v_old_name, v_args, '', v_old_body
  );
  execute format(
    'create function pg_temp.%I(%s) '
    'returns jsonb language plpgsql security definer set search_path = %L as %L',
    v_new_name, v_args, '', v_new_body
  );

  -- Strip only the leading "CREATE OR REPLACE FUNCTION <schema>.<name>("
  -- identity, which necessarily differs between the real function and its
  -- pg_temp scratch copies (two functions cannot share one name). Nothing
  -- inside the argument list, attribute clauses, or body is touched -- a
  -- comment or string literal anywhere in the body remains fully part of
  -- the comparison.
  v_current := regexp_replace(
    pg_get_functiondef(
      'public.hugo_apply_access(uuid,text,text,jsonb,text,timestamptz,text)'::regprocedure
    ),
    '^CREATE OR REPLACE FUNCTION [^(]+\(',
    'CREATE OR REPLACE FUNCTION FN('
  );
  v_expected_old := regexp_replace(
    pg_get_functiondef(
      ('pg_temp.' || v_old_name ||
       '(uuid,text,text,jsonb,text,timestamptz,text)')::regprocedure
    ),
    '^CREATE OR REPLACE FUNCTION [^(]+\(',
    'CREATE OR REPLACE FUNCTION FN('
  );
  v_expected_new := regexp_replace(
    pg_get_functiondef(
      ('pg_temp.' || v_new_name ||
       '(uuid,text,text,jsonb,text,timestamptz,text)')::regprocedure
    ),
    '^CREATE OR REPLACE FUNCTION [^(]+\(',
    'CREATE OR REPLACE FUNCTION FN('
  );

  -- Drop the scratch copies unconditionally, before branching on the
  -- comparison result, so every path below (no-op, install, refuse) leaves
  -- pg_temp exactly as it found it.
  execute format(
    'drop function pg_temp.%I(uuid,text,text,jsonb,text,timestamptz,text)',
    v_old_name
  );
  execute format(
    'drop function pg_temp.%I(uuid,text,text,jsonb,text,timestamptz,text)',
    v_new_name
  );

  if v_current = v_expected_new then
    raise notice
      'hugo_apply_access already matches the known patched (final-owner-guard receipt) form exactly; no changes made.';
    -- No modification to the live function or its privileges on this path:
    -- return before the install/REVOKE/GRANT below ever run.
    return;
  end if;

  if v_current is distinct from v_expected_old then
    raise exception
      'hugo_apply_access installed source matches neither the known pre-patch form nor the known patched form (exact whole-body comparison). Refusing to modify; manual review required.'
      using errcode = '55000';
  end if;

  raise notice
    'hugo_apply_access matches the known pre-patch form exactly; installing the patched body.';
  execute format(
    'create or replace function public.hugo_apply_access(%s) '
    'returns jsonb language plpgsql security definer set search_path = %L as %L',
    v_args, '', v_new_body
  );

  -- Privilege statements live on this branch only, so a no-op run never
  -- re-issues them against a function it did not touch.
  execute
    'revoke all on function public.hugo_apply_access('
    'uuid, text, text, jsonb, text, timestamptz, text'
    ') from public, anon, authenticated';
  execute
    'grant execute on function public.hugo_apply_access('
    'uuid, text, text, jsonb, text, timestamptz, text'
    ') to service_role';
end;
$migration$;

commit;
