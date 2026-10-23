-- question_bank_summary used bool_or ("ever" semantics): a question answered
-- wrong and later corrected counted in BOTH solved and missed. Align the bank
-- with the session page and review queue: a question's status is its LATEST
-- attempt (solved = latest correct, missed = latest wrong, mutually exclusive).
drop function if exists public.question_bank_summary(text[]);
create function public.question_bank_summary(p_sources text[]) returns table (
  section text, domain text, skill text, difficulty text, total bigint, answered bigint, solved bigint, missed bigint
) language sql stable security definer set search_path = '' as $$
  with ranked as (
    select question_id, is_correct,
      row_number() over (partition by question_id order by created_at desc) as rn
    from public.practice_attempts where user_id = (select auth.uid())
  ), statuses as (
    select question_id, is_correct from ranked where rn = 1
  )
  select q.section::text, q.domain, q.skill, q.difficulty::text,
    count(*),
    count(s.question_id),
    count(*) filter (where s.is_correct is true),
    count(*) filter (where s.is_correct is false)
  from public.questions q left join statuses s on s.question_id = q.id
  where q.is_official and q.usable and (p_sources is null or q.source_id = any(p_sources))
  group by q.section, q.domain, q.skill, q.difficulty
$$;
