-- BMH Institute: re-apply course-access row filter to answer_options reads.
-- HARDEN-04 follow-up. Migration 008 introduced public.answer_options_public
-- as a definer-mode view to hide is_correct, but in doing so dropped the
-- answer_options_learner_read policy and granted SELECT on the view to
-- authenticated with no row filter. The result was that any signed-in
-- learner could read every answer option in the database, including options
-- for quizzes attached to courses they had no role-group access to.
--
-- This migration restores the access boundary by:
--   1. Re-defining the view in invoker mode so RLS on the underlying table
--      is consulted on every read.
--   2. Recreating answer_options_learner_read with the original predicate
--      from migration 003 (fn_user_has_course_access against modules).
--   3. Re-granting SELECT on the underlying table to authenticated so the
--      view (now in invoker mode) can resolve the predicate.
--
-- The is_correct column is still hidden from learners because the view's
-- column list does not include it, and the existing answer_options_admin_all
-- policy continues to scope full-table access to admins and owners.

create or replace view public.answer_options_public
  with (security_invoker = on) as
  select id, question_id, option_text, sort_order
  from public.answer_options;

create policy answer_options_learner_read on public.answer_options
  for select using (
    exists (
      select 1 from public.questions q
      join public.lessons l on l.quiz_id = q.quiz_id
      join public.modules m on m.id = l.module_id
      where q.id = answer_options.question_id
        and public.fn_user_has_course_access(auth.uid(), m.course_id)
    )
  );

grant select on public.answer_options to authenticated;

-- Service-role keys (createAdminClient) continue to bypass RLS and read
-- is_correct for scoring in submitQuizAttempt. Admin/owner sessions still
-- read the underlying table via answer_options_admin_all (003 lines 175-177).
