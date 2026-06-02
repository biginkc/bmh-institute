-- BMH Institute: close direct answer key reads.
--
-- Migration 009 correctly restored row filtering for answer_options_public,
-- but it also restored table-level SELECT on public.answer_options for every
-- authenticated session. That made is_correct selectable through direct
-- PostgREST table requests.
--
-- Keep invoker-mode view reads working by granting back only the
-- non-sensitive columns selected by answer_options_public. Do not grant any
-- base-table privilege on is_correct to anon or authenticated. Server-side
-- grading and admin quiz authoring use the service-role client after
-- app-level authorization.

set lock_timeout = '10s';

revoke all privileges on table public.answer_options from anon, authenticated;

grant select (id, question_id, option_text, sort_order)
  on table public.answer_options
  to authenticated;

grant select on public.answer_options_public to authenticated;
