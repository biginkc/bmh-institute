-- Give the v040 private helper an explicit name below PostgreSQL's 63-byte
-- identifier limit. The three pre-existing v039 names remain functionally
-- consistent and are intentionally outside this narrow forward repair.

set lock_timeout = '10s';

alter function private."fn_cleanup_unreleased_import_reviewer_evidence_v040_without_sto"(text, uuid)
  rename to fn_cleanup_reviewer_evidence_v040;

create or replace function public.fn_cleanup_unreleased_import_reviewer_evidence_v1(
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
  v_result := private.fn_cleanup_reviewer_evidence_v040(
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
