-- Feature pack: error log, question reports, shared progress links, weekly
-- digest, question calibration, and the profile-role escalation guard.
--
-- Additive except for the role/suspension privileges: those columns are
-- promoted through public.admin_set_user_access(), which re-checks is_admin()
-- inside the database instead of trusting the caller.

-- ---------------------------------------------------------------------------
-- 1. Error log: one reason per missed question, private to its owner.
-- ---------------------------------------------------------------------------
create table if not exists public.attempt_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  attempt_id uuid references public.practice_attempts(id) on delete set null,
  reason text not null check (reason in ('content_gap', 'process_slip', 'misread', 'time_pressure')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

alter table public.attempt_notes enable row level security;

drop policy if exists attempt_notes_owner on public.attempt_notes;
create policy attempt_notes_owner on public.attempt_notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists attempt_notes_set_updated_at on public.attempt_notes;
create trigger attempt_notes_set_updated_at before update on public.attempt_notes
  for each row execute function public.set_updated_at();

create index if not exists attempt_notes_user_idx
  on public.attempt_notes (user_id, created_at desc);
create index if not exists attempt_notes_question_idx
  on public.attempt_notes (question_id);

grant select, insert, update, delete on public.attempt_notes to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Question reports: students flag broken content; admins triage.
-- ---------------------------------------------------------------------------
create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('wrong_answer', 'broken_media', 'typo', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (user_id, question_id)
);

alter table public.question_reports enable row level security;

drop policy if exists question_reports_own_create on public.question_reports;
create policy question_reports_own_create on public.question_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open');

drop policy if exists question_reports_own_read on public.question_reports;
create policy question_reports_own_read on public.question_reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists question_reports_admin_update on public.question_reports;
create policy question_reports_admin_update on public.question_reports
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create index if not exists question_reports_status_idx
  on public.question_reports (status, created_at desc);
create index if not exists question_reports_question_idx
  on public.question_reports (question_id);

grant select, insert, update on public.question_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Share links: expiring, revocable, stats-only read access.
-- ---------------------------------------------------------------------------
create table if not exists public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.share_tokens enable row level security;

drop policy if exists share_tokens_owner on public.share_tokens;
create policy share_tokens_owner on public.share_tokens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists share_tokens_user_idx
  on public.share_tokens (user_id, created_at desc);
create index if not exists share_tokens_token_idx
  on public.share_tokens (token);

grant select, insert, update, delete on public.share_tokens to authenticated;

-- One call resolves a token and returns the same aggregate numbers the right
-- rail uses, plus the last five completed tests. No email, no answer text.
create or replace function public.shared_progress(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.share_tokens;
  s record;
  tests jsonb;
begin
  if p_token is null or length(btrim(p_token)) < 16 then
    return null;
  end if;

  select * into t
  from public.share_tokens
  where token = btrim(p_token)
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if t.id is null then
    return null;
  end if;

  select l.* into s
  from (select 1) dummy
  left join public.leaderboard(1000) l on l.user_id = t.user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'total', x.total_score,
    'rw', x.rw_score,
    'math', x.math_score,
    'completedAt', x.completed_at
  ) order by x.completed_at desc), '[]'::jsonb)
  into tests
  from (
    select total_score, rw_score, math_score, completed_at
    from public.test_sessions
    where user_id = t.user_id and status = 'completed'
    order by completed_at desc
    limit 5
  ) x;

  return jsonb_build_object(
    'username', s.username,
    'xp', coalesce(s.xp, 0),
    'questions', coalesce(s.questions, 0),
    'accuracy', coalesce(s.accuracy, 0),
    'activeDays', coalesce(s.streak, 0),
    'tests', tests,
    'expiresAt', t.expires_at
  );
end;
$$;

revoke all on function public.shared_progress(text) from public, anon, authenticated;
grant execute on function public.shared_progress(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public share card: aggregate stats by handle, no auth required.
-- ---------------------------------------------------------------------------
create or replace function public.public_share_card(p_handle text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username', p.username,
    'xp', coalesce(l.xp, 0),
    'questions', coalesce(l.questions, 0),
    'accuracy', coalesce(l.accuracy, 0),
    'activeDays', coalesce(l.streak, 0)
  )
  from public.profiles p
  left join public.leaderboard(1000) l on l.user_id = p.id
  where lower(p.username) = lower(btrim(p_handle))
  limit 1;
$$;

revoke all on function public.public_share_card(text) from public, anon, authenticated;
grant execute on function public.public_share_card(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Weekly digest: opt-in flag on the profile; recipients are service-role
--    only because they include the account email.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists digest_opt_in boolean not null default false;
alter table public.profiles
  add column if not exists digest_last_sent_at timestamptz;

grant update (digest_opt_in) on public.profiles to authenticated;

create or replace function public.digest_recipients()
returns table (
  user_id uuid,
  email text,
  username text,
  xp bigint,
  questions integer,
  accuracy integer,
  active_days integer,
  last_practised timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    u.email::text,
    p.username,
    coalesce(l.xp, 0),
    coalesce(l.questions, 0),
    coalesce(l.accuracy, 0),
    coalesce(l.streak, 0),
    (select max(a.created_at) from public.practice_attempts a where a.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.leaderboard(1000) l on l.user_id = p.id
  where p.digest_opt_in = true and u.email is not null
  order by p.id
  limit 2000;
$$;

revoke all on function public.digest_recipients() from public, anon, authenticated;
grant execute on function public.digest_recipients() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Question calibration: admin-only p-value report.
-- ---------------------------------------------------------------------------
create or replace function public.admin_question_calibration()
returns table (
  question_id uuid,
  source_id text,
  domain text,
  skill text,
  difficulty text,
  attempts bigint,
  correct bigint,
  p_correct numeric,
  suggested text
)
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
  with stats as (
    select
      q.id,
      q.source_id,
      q.domain,
      q.skill,
      q.difficulty::text as difficulty,
      count(a.id)::bigint as attempts,
      count(a.id) filter (where a.is_correct)::bigint as correct
    from public.questions q
    join public.practice_attempts a on a.question_id = q.id
    where q.is_official and q.usable
    group by q.id, q.source_id, q.domain, q.skill, q.difficulty
    having count(a.id) >= 10
  ), scored as (
    select
      stats.*,
      round(stats.correct::numeric / nullif(stats.attempts, 0), 3) as p_correct,
      case stats.difficulty
        when 'easy' then 0.78
        when 'medium' then 0.55
        else 0.35
      end as expected
    from stats
  )
  select
    scored.id,
    scored.source_id,
    scored.domain,
    scored.skill,
    scored.difficulty,
    scored.attempts,
    scored.correct,
    scored.p_correct,
    case
      when scored.p_correct < 0.30 then 'hard'
      when scored.p_correct < 0.55 then 'medium'
      else 'easy'
    end as suggested
  from scored
  where abs(scored.p_correct - scored.expected) >= 0.18
  order by abs(scored.p_correct - scored.expected) desc
  limit 200;
end;
$$;

revoke all on function public.admin_question_calibration() from public, anon, authenticated;
grant execute on function public.admin_question_calibration() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Profile role guard + the only write path for role/suspension.
-- ---------------------------------------------------------------------------
create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role and direct database maintenance have no end-user JWT.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role and not private.current_user_is_admin() then
    raise exception 'Only admins can change roles';
  end if;

  if new.community_suspended_until is distinct from old.community_suspended_until
     and not private.current_user_is_admin() then
    raise exception 'Only admins can change suspensions';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function private.protect_profile_role();

create or replace function public.admin_set_user_access(p_user uuid, p_operation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_user is null then
    raise exception 'Invalid user';
  end if;
  if p_user = auth.uid() and p_operation = 'demote' then
    raise exception 'You cannot remove your own admin access';
  end if;

  if p_operation = 'promote' then
    update public.profiles set role = 'admin' where id = p_user;
  elsif p_operation = 'demote' then
    update public.profiles set role = 'student' where id = p_user;
  elsif p_operation = 'suspend' then
    update public.profiles
    set community_suspended_until = now() + interval '7 days'
    where id = p_user;
  elsif p_operation = 'restore' then
    update public.profiles set community_suspended_until = null where id = p_user;
  else
    raise exception 'Invalid operation';
  end if;
end;
$$;

revoke all on function public.admin_set_user_access(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_access(uuid, text) to authenticated;

-- The action now writes through admin_set_user_access(); close the direct
-- column path so a student cannot promote themselves even if they find the
-- PostgREST endpoint.
revoke update (role) on public.profiles from authenticated;
revoke update (community_suspended_until) on public.profiles from authenticated;
