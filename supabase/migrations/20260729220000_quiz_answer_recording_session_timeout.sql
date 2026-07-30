-- Bound row-lock waits for answer recording. The prior function-level
-- statement_timeout setting was ineffective for the statement that invoked
-- the function, so this migration deliberately removes that false guarantee.
alter function public.fn_record_quiz_answer(uuid, uuid, text[])
  set lock_timeout = '5s';

alter function public.fn_record_quiz_answer(uuid, uuid, text[])
  reset statement_timeout;
