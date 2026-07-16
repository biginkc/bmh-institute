-- Private course artwork, video support assets, and native flashcards.

-- Learners must never be able to enumerate or sign predictable content paths.
-- Server pages first load authorized rows through course RLS, then use the
-- service role to mint short-lived URLs for only the paths returned by RLS.
drop policy if exists "content_authenticated_read" on storage.objects;

alter table public.programs add column if not exists thumbnail_path text;
alter table public.courses add column if not exists thumbnail_path text;
alter table public.lessons add column if not exists thumbnail_path text;
alter table public.assignments add column if not exists rubric jsonb not null default '[]'::jsonb;

alter table public.content_blocks
  drop constraint if exists content_blocks_block_type_check;

alter table public.content_blocks
  add constraint content_blocks_block_type_check check (block_type in (
    'video','text','pdf','image','audio','download','external_link','embed',
    'role_play','divider','callout','flashcard'
  ));

update storage.buckets
set allowed_mime_types = array_append(coalesce(allowed_mime_types, '{}'::text[]), 'text/vtt')
where id = 'content'
  and not ('text/vtt' = any(coalesce(allowed_mime_types, '{}'::text[])));

comment on column public.programs.thumbnail_path is
  'Private content-bucket path for the program cover. Signed at read time.';
comment on column public.courses.thumbnail_path is
  'Private content-bucket path for the course cover. Signed at read time.';
comment on column public.lessons.thumbnail_path is
  'Private content-bucket path for the lesson card artwork. Signed at read time.';
