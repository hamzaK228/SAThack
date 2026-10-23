-- Leaderboard question counts: one row per question, status from its LATEST attempt.
--
-- The board used to report raw attempt rows as "questions" (and accuracy as
-- correct attempts / attempt rows), so a student who missed a question and then
-- corrected it on a retry appeared with two "questions" — one wrong, one right.
-- Every other surface now counts a question once (right rail, analytics page,
-- question bank chips), so the board follows the same rule.
--
-- XP deliberately stays attempt-based (2/attempt + 5/correct attempt): retrying
-- is work, and the client-side twin in src/lib/gamification.ts does the same.
create or replace function public.leaderboard(limit_count int default 25)
returns table (
  user_id uuid,
  display_name text,
  xp bigint,
  questions int,
  accuracy int,
  streak int,
  is_me boolean
)
language sql
security definer
set search_path = public
as $$
  with attempts as (
    select
      user_id,
      count(*)::int as attempts,
      count(*) filter (where is_correct)::int as correct,
      count(distinct (created_at at time zone 'utc')::date)::int as active_days
    from public.practice_attempts
    group by user_id
  ),
  latest as (
    select distinct on (user_id, question_id) user_id, question_id, is_correct
    from public.practice_attempts
    where question_id is not null
    order by user_id, question_id, created_at desc
  ),
  per_user as (
    select
      user_id,
      count(*)::int as questions,
      count(*) filter (where is_correct)::int as solved
    from latest
    group by user_id
  ),
  tests as (
    select user_id, count(*)::int as tests
    from public.test_sessions
    where status = 'completed'
    group by user_id
  ),
  vocab as (
    select user_id, count(*) filter (where times_seen > 0)::int as reviews
    from public.vocab_progress
    group by user_id
  )
  select
    p.id,
    coalesce(nullif(p.full_name, ''), 'Anonymous') as display_name,
    (
      coalesce(a.attempts, 0)::bigint * 2
      + coalesce(a.correct, 0)::bigint * 5
      + coalesce(t.tests, 0)::bigint * 100
      + coalesce(v.reviews, 0)::bigint * 3
      + coalesce(a.active_days, 0)::bigint * 10
    ) as xp,
    coalesce(q.questions, 0),
    case when coalesce(q.questions, 0) = 0 then 0
         else round(100.0 * q.solved / q.questions)::int end,
    coalesce(a.active_days, 0),
    p.id = auth.uid() as is_me
  from public.profiles p
  left join attempts a on a.user_id = p.id
  left join per_user q on q.user_id = p.id
  left join tests t on t.user_id = p.id
  left join vocab v on v.user_id = p.id
  order by xp desc, display_name asc
  limit greatest(1, least(limit_count, 100));
$$;

grant execute on function public.leaderboard(int) to authenticated;
