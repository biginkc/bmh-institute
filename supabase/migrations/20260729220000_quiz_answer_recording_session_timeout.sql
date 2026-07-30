-- Reapply the answer-recording bounds after the current production migration
-- head. This is additive to the original 20260729150000 migration and
-- deliberately avoids PR137's 20260729210000 id.
alter function public.fn_record_quiz_answer(uuid, uuid, text[])
  set lock_timeout = '5s';

alter function public.fn_record_quiz_answer(uuid, uuid, text[])
  set statement_timeout = '8s';
