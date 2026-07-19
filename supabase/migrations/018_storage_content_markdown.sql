-- Course transcript assets use text/markdown in the deterministic import manifest.
-- Preserve every existing content-bucket MIME type and append this one once.

update storage.buckets
set allowed_mime_types = array_append(
  coalesce(allowed_mime_types, '{}'::text[]),
  'text/markdown'
)
where id = 'content'
  and not ('text/markdown' = any(coalesce(allowed_mime_types, '{}'::text[])));
