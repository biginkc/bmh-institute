-- BMH Training Platform — Storage bucket for learner submissions
-- Private bucket. Learners upload into `{user_id}/...` prefix and can only
-- read their own objects back. Admins can read every submission for the
-- reviewer queue.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  (500::bigint * 1024 * 1024),
  null
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Learner writes are scoped to a folder named after their auth.uid().
create policy "submissions_self_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "submissions_self_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "submissions_self_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "submissions_admin_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions' and public.is_admin(auth.uid())
  );
