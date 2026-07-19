-- Supabase Storage protects direct object-table deletes unless its API guard
-- is transaction-local and explicit. Wrap the exact v040 reviewer cleanup so
-- its storage deletion remains part of the same atomic rejection cleanup.

set lock_timeout = '10s';

alter function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  set schema private;
alter function private.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  rename to fn_cleanup_unreleased_import_reviewer_evidence_v040_without_storage_guard;

revoke all on function private.fn_cleanup_unreleased_import_reviewer_evidence_v040_without_storage_guard(text, uuid)
  from public, anon, authenticated, service_role;

create function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(
  p_import_id text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Imported review evidence cleanup requires the service role.'
      using errcode = '42501';
  end if;

  perform set_config('storage.allow_delete_query', 'true', true);
  v_result := private.fn_cleanup_unreleased_import_reviewer_evidence_v040_without_storage_guard(
    p_import_id,
    p_user_id
  );
  perform set_config('storage.allow_delete_query', 'false', true);

  return v_result;
end;
$$;

revoke all on function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(text, uuid)
  to service_role;
