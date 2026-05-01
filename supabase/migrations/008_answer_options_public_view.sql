-- BMH Institute: answer_options public view (HARDEN-04)
-- Hides is_correct from learner sessions. Definer-mode view with a pinned
-- column list prevents future column leak. The admin policy on the
-- underlying table is preserved for the lesson editor; service-role bypass
-- is preserved for server-side scoring (createAdminClient).

create or replace view public.answer_options_public
  with (security_invoker = off) as
  select id, question_id, option_text, sort_order
  from public.answer_options;

drop policy if exists answer_options_learner_read on public.answer_options;

grant select on public.answer_options_public to authenticated;
revoke select on public.answer_options from authenticated;

-- Admin/owner sessions still read the underlying table via the existing
-- answer_options_admin_all policy (003_rls_policies.sql lines 175-177).
-- Service-role keys (createAdminClient) bypass RLS entirely and continue
-- to read is_correct for scoring in submitQuizAttempt.
