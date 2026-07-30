-- A blocked attempt-row lock must fail closed instead of leaving the learner's
-- answer-check request open indefinitely. The migration-level timeout is
-- retained under its original unapplied migration identity.
alter function public.fn_record_quiz_answer(uuid, uuid, text[])
  set lock_timeout = '5s';

alter function public.fn_record_quiz_answer(uuid, uuid, text[])
  set statement_timeout = '8s';
