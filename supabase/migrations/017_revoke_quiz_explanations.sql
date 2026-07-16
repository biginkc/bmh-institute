-- Quiz explanations can reveal the answer even when is_correct is hidden.
-- Learner quiz delivery and grading run through server actions, while the
-- admin editor reads explanations through the service-role client.

set lock_timeout = '10s';

revoke select on public.questions from anon, authenticated;

grant select (
  id,
  quiz_id,
  question_text,
  question_type,
  points,
  sort_order,
  created_at,
  updated_at
) on public.questions to authenticated;
