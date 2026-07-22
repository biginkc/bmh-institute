-- Exact reconciliation may allow the explicitly approved rollback poster paths
-- only after proving that the corresponding replacement audit exists.
grant select on table public.content_import_video_poster_replacement_records
to service_role;
grant select on table public.content_import_canary_video_poster_replacement_records
to service_role;
