-- XP integrity + explanation-reveal budget
--
-- 1. Leaderboard XP now counts each question once (latest attempt), matching
--    the accuracy/questions columns and the product copy. Retrying a question
--    no longer mints unbounded XP.
-- 2. Explanation reveals are budgeted per UTC day so a script cannot turn the
--    "show explanation after a miss" feature into a bulk key dump.
-- 3. Indexes for the distinct-on leaderboard and the analytics test feed.

create table if not exists public.question_reveals (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  revealed_on date not null,
  first_revealed_at timestamptz not null default now(),
  last_revealed_at timestamptz not null default now(),
  reveal_count integer not null default 1,
  primary key (user_id, question_id, revealed_on)
);

alter table public.question_reveals enable row level security;
revoke all on table public.question_reveals from anon, authenticated;

create index if not exists question_reveals_user_day_idx
  on public.question_reveals (user_id, revealed_on);

create or replace function public.reveal_answer(p_question_id uuid)
returns table(correct_answer text, explanation text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_day date := (now() at time zone 'utc')::date;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.questions q
    where q.id = p_question_id and q.usable
  ) then
    return;
  end if;

  -- Admins need full rows for content QA and are not budgeted.
  if public.is_admin() then
    return query
      select q.correct_answer, q.explanation
      from public.questions q
      where q.id = p_question_id and q.usable;
    return;
  end if;

  if not exists (
    select 1 from public.practice_attempts a
    where a.user_id = uid and a.question_id = p_question_id
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.question_reveals r
    where r.user_id = uid and r.question_id = p_question_id and r.revealed_on = v_day
  ) then
    if (
      select count(*) from public.question_reveals r
      where r.user_id = uid and r.revealed_on = v_day
    ) >= 250 then
      raise exception 'Daily explanation limit reached. Try again tomorrow.';
    end if;

    insert into public.question_reveals (user_id, question_id, revealed_on)
    values (uid, p_question_id, v_day)
    on conflict do nothing;
  else
    update public.question_reveals
    set last_revealed_at = now(), reveal_count = reveal_count + 1
    where user_id = uid and question_id = p_question_id and revealed_on = v_day;
  end if;

  return query
    select q.correct_answer, q.explanation
    from public.questions q
    where q.id = p_question_id and q.usable;
end;
$$;

revoke all on function public.reveal_answer(uuid) from public, anon, authenticated;
grant execute on function public.reveal_answer(uuid) to authenticated;

create or replace function public.leaderboard(limit_count integer default 25)
returns table(user_id uuid, username text, display_name text, xp bigint, questions integer, accuracy integer, streak integer, is_me boolean)
language sql
security definer
set search_path = 'public'
as $$
  with attempts as (
    select user_id,
           count(distinct (created_at at time zone 'utc')::date)::int as active_days
    from public.practice_attempts group by user_id
  ),
  latest as (
    select distinct on (user_id, question_id) user_id, question_id, is_correct
    from public.practice_attempts where question_id is not null
    order by user_id, question_id, created_at desc
  ),
  per_user as (
    select user_id,
           count(*)::int as questions,
           count(*) filter (where is_correct)::int as solved
    from latest group by user_id
  ),
  tests as (
    select user_id, count(*)::int as tests
    from public.test_sessions where status = 'completed' group by user_id
  ),
  vocab as (
    select user_id, count(*) filter (where times_seen > 0)::int as reviews
    from public.vocab_progress group by user_id
  )
  select
    p.id, p.username,
    coalesce(nullif(p.full_name, ''), 'Anonymous') as display_name,
    (coalesce(q.questions, 0)::bigint * 2
     + coalesce(q.solved, 0)::bigint * 5
     + coalesce(t.tests, 0)::bigint * 100
     + coalesce(v.reviews, 0)::bigint * 3
     + coalesce(a.active_days, 0)::bigint * 10) as xp,
    coalesce(q.questions, 0),
    case when coalesce(q.questions, 0) = 0 then 0 else round(100.0 * q.solved / q.questions)::int end,
    coalesce(a.active_days, 0),
    p.id = auth.uid() as is_me
  from public.profiles p
  left join attempts a on a.user_id = p.id
  left join per_user q on q.user_id = p.id
  left join tests t on t.user_id = p.id
  left join vocab v on v.user_id = p.id
  order by xp desc, display_name asc
  limit greatest(1, least(limit_count, 1000));
$$;

revoke all on function public.leaderboard(integer) from public, anon, authenticated;
grant execute on function public.leaderboard(integer) to authenticated;

create index if not exists practice_attempts_user_question_created_idx
  on public.practice_attempts (user_id, question_id, created_at desc);

create index if not exists test_sessions_user_status_completed_idx
  on public.test_sessions (user_id, status, completed_at desc);
