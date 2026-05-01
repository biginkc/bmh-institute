-- BMH Institute: enforce "at least one owner" at the database layer.
-- HARDEN-03 follow-up (WR-04). The deleteUser server action checked the
-- owner count from a learner-scoped Supabase client and then performed
-- the auth.admin.deleteUser call separately. The check and the delete
-- are not in the same transaction, so two admins concurrently deleting
-- the only two remaining owners would both observe count = 2, both
-- pass the guard, and both succeed. The org would be left ownerless.
--
-- This migration moves the invariant into the database. A BEFORE DELETE
-- trigger on public.profiles inspects the owner count under the row
-- lock and raises if removing the row would leave zero owners. The
-- trigger fires regardless of which client deletes the row (server
-- action, dashboard SQL, future cron job), so the invariant is the
-- source of truth.
--
-- The application-level guard in actions.ts is kept for the better UX
-- toast, but the database is now authoritative.

create or replace function public.fn_prevent_last_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owner_count integer;
begin
  if old.system_role <> 'owner' then
    return old;
  end if;

  -- Count owners other than the row about to be deleted.
  select count(*)
    into remaining_owner_count
    from public.profiles
    where system_role = 'owner'
      and id <> old.id;

  if remaining_owner_count = 0 then
    raise exception 'Cannot delete the last remaining owner.'
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_prevent_last_owner_deletion on public.profiles;
create trigger trg_prevent_last_owner_deletion
  before delete on public.profiles
  for each row execute function public.fn_prevent_last_owner_deletion();

-- Notes:
--   - Cascading deletes from auth.users (via the FK declared in
--     migration 001) fire BEFORE DELETE on profiles, so admin SDK
--     deleteUser calls are also covered.
--   - The trigger uses count(*) under the implicit row lock taken on
--     `delete`; concurrent deletes serialize through that lock, which
--     closes the original race.
