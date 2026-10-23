-- The trigger fires private.grade_attempt. Two fixes in one:
-- (1) The 2026-09-28 bank split set real practice-form questions to
--     is_official=false, but this trigger still required is_official, so every
--     full_test attempt insert (assessment advance) raised 'Invalid question
--     or answer' and module 2 became unreachable. Accept any usable question.
-- (2) The function must stay SECURITY DEFINER (with an empty search_path):
--     drill inserts run as the student, and an invoker-security trigger cannot
--     execute private.answer_matches, which made every drill answer fail with
--     'could not be saved'.
create or replace function private.grade_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare q public.questions;
begin
  select * into q from public.questions where id = new.question_id and usable;
  if not found or length(coalesce(new.selected_answer,'')) > 200 then raise exception 'Invalid question or answer'; end if;
  new.correct_answer := q.correct_answer;
  new.is_correct := private.answer_matches(new.selected_answer, q.correct_answer);
  new.section := q.section;
  new.domain := q.domain;
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end $$;
