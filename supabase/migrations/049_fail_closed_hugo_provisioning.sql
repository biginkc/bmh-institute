-- Keep newly admin-provisioned accounts denied until role/group assignment
-- succeeds. The Auth row and profile row cannot be created transactionally
-- across GoTrue and Postgres, so the trigger must choose the safe state.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when new.raw_app_meta_data->>'provisioning_origin' = 'institute_admin'
        then 'invited'
      else 'active'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates admin-provisioned Institute profiles as invited; fn_save_user_settings is the only promotion to active.';
