-- Security hardening (October 2026)
--
-- 1. Answer keys: `questions.correct_answer`/`explanation` are no longer
--    readable by ordinary clients. Grading, retries and explanations go
--    through definer RPCs; admins get full rows through admin-only RPCs.
-- 2. Attempts: the browser no longer inserts directly into practice_attempts;
--    record_attempt() validates and rate-limits the write.
-- 3. Guest duel: only a fixed 48-question demo set can be graded, so the
--    anonymous "is this correct?" check cannot be used to enumerate the bank.

-- ---------------------------------------------------------------------------
-- 1. Guest demo pool
-- ---------------------------------------------------------------------------
alter table public.questions
  add column if not exists guest_demo boolean not null default false;

with ranked as (
  select id,
         row_number() over (partition by section order by source_id, id) as rn
  from public.questions
  where is_official and usable
    and section in ('math', 'reading_writing')
)
update public.questions q
set guest_demo = true
from ranked r
where q.id = r.id and r.rn <= 24;

create index if not exists questions_guest_demo_idx
  on public.questions (guest_demo) where guest_demo;

create or replace function public.guest_duel_questions(chosen_subject text)
returns table(
  id uuid,
  section text,
  domain text,
  skill text,
  difficulty text,
  is_grid_in boolean,
  question_text text,
  question_text_html text,
  passage text,
  passage_html text,
  choices jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.section::text, q.domain::text, q.skill::text, q.difficulty::text, q.is_grid_in,
    q.question_text, q.question_text_html, q.passage, q.passage_html, q.choices
  from public.questions q
  where chosen_subject in ('math', 'reading_writing')
    and q.section::text = chosen_subject
    and q.is_official and q.usable and q.guest_demo
  order by q.source_id, q.id
  limit 24
$$;

create or replace function public.guest_duel_check_answer(p_question_id uuid, p_answer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correct text;
begin
  if p_question_id is null or p_answer is null then return false; end if;
  if length(btrim(p_answer)) = 0 or length(btrim(p_answer)) > 200 then return false; end if;
  select q.correct_answer into v_correct from public.questions q
    where q.id = p_question_id
      and q.is_official and q.usable and q.guest_demo
      and q.section::text in ('math', 'reading_writing');
  if v_correct is null then return false; end if;
  return private.duel_answer_is_correct(btrim(p_answer), v_correct);
end;
$$;

revoke all on function public.guest_duel_questions(text) from public, anon, authenticated;
revoke all on function public.guest_duel_check_answer(uuid, text) from public, anon, authenticated;
grant execute on function public.guest_duel_questions(text) to anon, authenticated;
grant execute on function public.guest_duel_check_answer(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Grading / retry / explanation RPCs
-- ---------------------------------------------------------------------------
create or replace function public.record_attempt(p_question_id uuid, p_answer text)
returns table(id uuid, is_correct boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_id uuid;
  v_correct boolean;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if p_question_id is null or p_answer is null then
    raise exception 'Invalid answer';
  end if;
  if length(btrim(p_answer)) = 0 or length(btrim(p_answer)) > 200 then
    raise exception 'Invalid answer';
  end if;
  if not exists (
    select 1 from public.questions q
    where q.id = p_question_id and q.usable
  ) then
    raise exception 'Invalid question';
  end if;
  -- A person can answer quickly, but not script thousands of rows per minute.
  if (
    select count(*) from public.practice_attempts a
    where a.user_id = uid
      and a.mode = 'drill'::public.attempt_mode
      and a.created_at > now() - interval '10 seconds'
  ) >= 30 then
    raise exception 'Too many answers at once — take a short break.';
  end if;

  insert into public.practice_attempts as pa (user_id, question_id, selected_answer, mode)
  values (uid, p_question_id, btrim(p_answer), 'drill'::public.attempt_mode)
  returning pa.id, pa.is_correct into v_id, v_correct;

  return query select v_id, v_correct;
end;
$$;

create or replace function public.check_answer(p_question_id uuid, p_answer text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.answer_matches(btrim(p_answer), q.correct_answer)
    from public.questions q
    where q.id = p_question_id
      and q.usable
      and exists (
        select 1 from public.practice_attempts a
        where a.user_id = (select auth.uid())
          and a.question_id = q.id
          and a.is_correct = false
      )
  ), false)
$$;

create or replace function public.reveal_answer(p_question_id uuid)
returns table(correct_answer text, explanation text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.correct_answer, q.explanation
  from public.questions q
  where q.id = p_question_id
    and q.usable
    and (
      public.is_admin()
      or exists (
        select 1 from public.practice_attempts a
        where a.user_id = (select auth.uid())
          and a.question_id = q.id
      )
    )
$$;

revoke all on function public.record_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.check_answer(uuid, text) from public, anon, authenticated;
revoke all on function public.reveal_answer(uuid) from public, anon, authenticated;
grant execute on function public.record_attempt(uuid, text) to authenticated;
grant execute on function public.check_answer(uuid, text) to authenticated;
grant execute on function public.reveal_answer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin-only full-row reads (the editor and test browser need answer keys)
-- ---------------------------------------------------------------------------
create or replace function public.admin_question(p_id uuid)
returns setof public.questions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  return query select * from public.questions where id = p_id;
end;
$$;

create or replace function public.admin_question_keys(p_ids uuid[])
returns table(id uuid, correct_answer text, explanation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  return query
    select q.id, q.correct_answer, q.explanation
    from public.questions q
    where q.id = any(p_ids);
end;
$$;

revoke all on function public.admin_question(uuid) from public, anon, authenticated;
revoke all on function public.admin_question_keys(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_question(uuid) to authenticated;
grant execute on function public.admin_question_keys(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Close the direct table paths
-- ---------------------------------------------------------------------------
-- Table-level SELECT covers every column, so it must be revoked before the
-- safe column grant is meaningful.
revoke select on public.questions from anon, authenticated;

grant select (
  id, section, domain, skill, difficulty, is_grid_in,
  question_text, question_text_html, passage, passage_html,
  image_url, choices, created_at, source_id, is_official, usable
) on public.questions to authenticated;

-- Attempts are written only through record_attempt(); removing direct INSERT
-- also removes the cheapest XP-farm path. DELETE is not used by the UI.
revoke insert, delete on public.practice_attempts from authenticated;
