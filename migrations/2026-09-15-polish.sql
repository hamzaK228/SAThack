-- ============================================================================
--  SAThack — polish batch migration (2026-09-15)
--
--  Run this once in the Supabase SQL editor (or `supabase db push`). It is
--  idempotent: every statement is guarded with IF NOT EXISTS / OR REPLACE, so
--  running it twice is safe.
--
--  Covers:
--    1. Spaced repetition columns on vocab_progress ("Know it / Review again")
--    2. study_plans + plan_tasks (plan check-off persistence)
--    3. leaderboard() RPC (cross-user ranking; profiles RLS is per-user)
--    4. Vocab example cleanup (PDF header/footer artifacts)
--    5. Drop the unused `lessons` table
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Spaced repetition on vocab_progress
-- ---------------------------------------------------------------------------
create table if not exists public.vocab_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  word_id uuid not null references public.vocab_words (id) on delete cascade,
  saved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, word_id)
);

alter table public.vocab_progress
  add column if not exists saved boolean not null default false,
  add column if not exists mastery int not null default 0,
  add column if not exists times_seen int not null default 0,
  add column if not exists times_correct int not null default 0,
  add column if not exists last_seen_at timestamptz,
  add column if not exists next_review_at timestamptz;

-- Remove any duplicate (user_id, word_id) rows first (a rare race from the old
-- select-then-insert save path), so the unique key can be added cleanly.
delete from public.vocab_progress a
  using public.vocab_progress b
  where a.user_id = b.user_id
    and a.word_id = b.word_id
    and a.id < b.id;

-- Ensure the upsert key exists even on tables created before this migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vocab_progress'::regclass
      and conname = 'vocab_progress_user_word_key'
  ) then
    alter table public.vocab_progress
      add constraint vocab_progress_user_word_key unique (user_id, word_id);
  end if;
end $$;

-- 0 = due now, 5 = mastered (30-day interval). Created by src/lib/vocab.ts.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vocab_progress_mastery_range'
  ) then
    alter table public.vocab_progress
      add constraint vocab_progress_mastery_range check (mastery between 0 and 5);
  end if;
end $$;

create index if not exists vocab_progress_due_idx
  on public.vocab_progress (user_id, next_review_at);

alter table public.vocab_progress enable row level security;

drop policy if exists "vocab_progress read" on public.vocab_progress;
create policy "vocab_progress read" on public.vocab_progress
  for select using (auth.uid() = user_id);

drop policy if exists "vocab_progress write" on public.vocab_progress;
create policy "vocab_progress write" on public.vocab_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Study-plan check-off persistence
-- ---------------------------------------------------------------------------
create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_score int,
  current_score int,
  test_date date,
  weeks int,
  summary text,
  generated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.study_plans (id) on delete cascade,
  -- Stable key = week + kind + title, so regeneration keeps your progress.
  task_key text not null,
  week int not null,
  title text not null,
  kind text not null,
  domain text,
  minutes int,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, task_key)
);

create index if not exists plan_tasks_user_idx on public.plan_tasks (user_id, week);

alter table public.study_plans enable row level security;
alter table public.plan_tasks enable row level security;

drop policy if exists "study_plans own" on public.study_plans;
create policy "study_plans own" on public.study_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "plan_tasks own" on public.plan_tasks;
create policy "plan_tasks own" on public.plan_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Leaderboard RPC
-- ---------------------------------------------------------------------------
-- profiles RLS only exposes the signed-in user's own row, so a cross-user
-- ranking has to go through a SECURITY DEFINER function. XP is derived from
-- data we already store (attempts, tests, vocab reviews, active days) — see
-- src/lib/gamification.ts for the client-side twin of this formula.
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
      count(*)::int as questions,
      count(*) filter (where is_correct)::int as correct,
      count(distinct (created_at at time zone 'utc')::date)::int as active_days
    from public.practice_attempts
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
      coalesce(a.questions, 0)::bigint * 2
      + coalesce(a.correct, 0)::bigint * 5
      + coalesce(t.tests, 0)::bigint * 100
      + coalesce(v.reviews, 0)::bigint * 3
      + coalesce(a.active_days, 0)::bigint * 10
    ) as xp,
    coalesce(a.questions, 0),
    case when coalesce(a.questions, 0) = 0 then 0
         else round(100.0 * a.correct / a.questions)::int end,
    coalesce(a.active_days, 0),
    p.id = auth.uid() as is_me
  from public.profiles p
  left join attempts a on a.user_id = p.id
  left join tests t on t.user_id = p.id
  left join vocab v on v.user_id = p.id
  order by xp desc, display_name asc
  limit greatest(1, least(limit_count, 100));
$$;

grant execute on function public.leaderboard(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Vocab example cleanup (PDF header/footer artifacts)
-- ---------------------------------------------------------------------------
-- The 1915-word list came from a PDF whose running footer leaked into a few
-- example sentences ("…to abet him.) SAT Vocabulary A"), and the parser
-- sometimes ran into the *next* entry ("…the sport.) abide 1. (v.) …").
-- src/lib/vocab.ts#cleanExample() applies the same two rules at render time, so
-- the UI is already clean — this makes the stored data match.
update public.vocab_words
set example_sentence = nullif(
      trim(both ' ' from regexp_replace(
        regexp_replace(example_sentence, '\s*\)?\s*(A\s+)?SAT\s+Vocab(ulary)?.*$', '', 'i'),
        '\s*\)?\s*[a-z][a-z-]{2,20}\s+[1-9]\.\s*\((n|v|adj|adv)\.\).*$', '', 'i'
      )),
      ''
    )
where example_sentence ~* '(SAT\s+Vocab|[a-z]{2,20}\s+[1-9]\.\s*\((n|v|adj|adv)\.\))';

-- ---------------------------------------------------------------------------
-- 5. Drop the unused `lessons` table
-- ---------------------------------------------------------------------------
-- Lessons are generated on the fly from the 5,155-chunk knowledge corpus
-- (src/lib/ai/knowledge.ts), so nothing reads or writes this table.
drop table if exists public.lessons;
