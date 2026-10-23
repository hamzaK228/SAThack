begin;

create table public.duel_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1000 check (rating >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  games integer not null default 0 check (games >= 0),
  updated_at timestamptz not null default now()
);

create table public.duel_matches (
  id uuid primary key default gen_random_uuid(),
  room_code text unique check (room_code is null or room_code ~ '^[A-Z2-9]{6}$'),
  match_type text not null check (match_type in ('ranked', 'private')),
  mode text not null check (mode in ('quick', 'rush')),
  subject text not null check (subject in ('math', 'reading_writing')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'paused', 'sudden_death', 'completed', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete cascade,
  player_one uuid not null references auth.users(id) on delete cascade,
  player_two uuid references auth.users(id) on delete set null,
  winner_id uuid references auth.users(id) on delete set null,
  question_ids uuid[] not null,
  starts_at timestamptz,
  ends_at timestamptz,
  paused_at timestamptz,
  disconnect_deadline timestamptz,
  ratings_applied boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.duel_players (
  match_id uuid not null references public.duel_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  question_index integer not null default 0 check (question_index >= 0),
  last_seen timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table public.duel_answers (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.duel_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_answer text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (match_id, user_id, question_index)
);

create index duel_matches_waiting_idx on public.duel_matches (status, match_type, mode, subject, created_at);
create index duel_matches_players_idx on public.duel_matches (player_one, player_two, status);
create index duel_players_seen_idx on public.duel_players (match_id, last_seen);

alter table public.duel_ratings enable row level security;
alter table public.duel_matches enable row level security;
alter table public.duel_players enable row level security;
alter table public.duel_answers enable row level security;

create policy "Players can read their duel rating"
on public.duel_ratings for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Participants can read duel matches"
on public.duel_matches for select to authenticated
using ((select auth.uid()) in (player_one, player_two));

create policy "Participants can read duel players"
on public.duel_players for select to authenticated
using (exists (
  select 1 from public.duel_matches match
  where match.id = match_id and (select auth.uid()) in (match.player_one, match.player_two)
));

create policy "Players can read their own duel answers"
on public.duel_answers for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.duel_ratings, public.duel_matches, public.duel_players, public.duel_answers from anon, authenticated;
grant select on public.duel_ratings, public.duel_matches, public.duel_players to authenticated;

create or replace function private.duel_questions(chosen_subject text)
returns uuid[]
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(array_agg(selected.id order by selected.sort_key), '{}'::uuid[])
  from (
    select balanced.id, random() as sort_key
    from (
      (select q.id from public.questions q
       where q.section::text = chosen_subject and q.difficulty::text = 'easy' and q.is_official and q.usable
       order by random() limit 14)
      union all
      (select q.id from public.questions q
       where q.section::text = chosen_subject and q.difficulty::text = 'medium' and q.is_official and q.usable
       order by random() limit 14)
      union all
      (select q.id from public.questions q
       where q.section::text = chosen_subject and q.difficulty::text = 'hard' and q.is_official and q.usable
       order by random() limit 14)
    ) balanced
  ) selected
$$;

create or replace function private.duel_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
    into code from generate_series(1, 6);
    exit when not exists (select 1 from public.duel_matches where room_code = code and status in ('waiting', 'active', 'paused', 'sudden_death'));
  end loop;
  return code;
end;
$$;

create or replace function private.duel_answer_is_correct(given_answer text, expected_answer text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  accepted text;
  given_number numeric;
  expected_number numeric;
begin
  if btrim(coalesce(given_answer, '')) = '' then return false; end if;
  foreach accepted in array regexp_split_to_array(expected_answer, ',\s*') loop
    if lower(btrim(given_answer)) = lower(btrim(accepted)) then return true; end if;
    begin
      given_number := btrim(given_answer)::numeric;
      expected_number := btrim(accepted)::numeric;
      if abs(given_number - expected_number) < 0.000001 then return true; end if;
    exception when invalid_text_representation then
      null;
    end;
  end loop;
  return false;
end;
$$;

create or replace function private.finish_duel(match_uuid uuid, winner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row public.duel_matches%rowtype;
  loser uuid;
begin
  select * into match_row from public.duel_matches where id = match_uuid for update;
  if match_row.status = 'completed' then return; end if;

  update public.duel_matches
  set status = 'completed', winner_id = winner, finished_at = now(), disconnect_deadline = null, paused_at = null
  where id = match_uuid;

  if match_row.match_type <> 'ranked' or match_row.ratings_applied then return; end if;
  insert into public.duel_ratings(user_id) values (match_row.player_one), (match_row.player_two)
  on conflict (user_id) do nothing;

  if winner is null then
    update public.duel_ratings set rating = rating + 5, games = games + 1, updated_at = now()
    where user_id in (match_row.player_one, match_row.player_two);
  else
    loser := case when winner = match_row.player_one then match_row.player_two else match_row.player_one end;
    update public.duel_ratings set rating = rating + 20, wins = wins + 1, games = games + 1, updated_at = now()
    where user_id = winner;
    update public.duel_ratings set rating = greatest(0, rating - 15), losses = losses + 1, games = games + 1, updated_at = now()
    where user_id = loser;
  end if;
  update public.duel_matches set ratings_applied = true where id = match_uuid;
end;
$$;

create or replace function public.duel_profile()
returns table(rating integer, wins integer, losses integer, games integer, active_match_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into public.duel_ratings(user_id) values (uid) on conflict (user_id) do nothing;
  return query
  select r.rating, r.wins, r.losses, r.games,
    (select m.id from public.duel_matches m
     where uid in (m.player_one, m.player_two) and m.status in ('waiting', 'active', 'paused', 'sudden_death')
     order by m.created_at desc limit 1)
  from public.duel_ratings r where r.user_id = uid;
end;
$$;

create or replace function public.duel_find_ranked(chosen_mode text, chosen_subject text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  my_rating integer;
  matched_row public.duel_matches%rowtype;
  created_id uuid;
  question_list uuid[];
  duration_seconds integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if chosen_mode not in ('quick', 'rush') or chosen_subject not in ('math', 'reading_writing') then raise exception 'Invalid duel settings'; end if;
  select m.id into created_id from public.duel_matches m
  where uid in (m.player_one, m.player_two) and m.status in ('waiting', 'active', 'paused', 'sudden_death')
  order by m.created_at desc limit 1;
  if created_id is not null then return created_id; end if;

  insert into public.duel_ratings(user_id) values (uid) on conflict (user_id) do nothing;
  select r.rating into my_rating from public.duel_ratings r where r.user_id = uid;

  select m.* into matched_row
  from public.duel_matches m
  join public.duel_ratings opponent_rating on opponent_rating.user_id = m.player_one
  where m.match_type = 'ranked' and m.status = 'waiting' and m.mode = chosen_mode and m.subject = chosen_subject
    and m.player_one <> uid and m.created_at > now() - interval '5 minutes'
    and abs(opponent_rating.rating - my_rating) <= least(500, 100 + floor(extract(epoch from (now() - m.created_at)) / 20)::int * 100)
  order by m.created_at
  limit 1 for update of m skip locked;

  duration_seconds := case when chosen_mode = 'quick' then 180 else 300 end;
  if matched_row.id is not null then
    update public.duel_matches set player_two = uid, status = 'active', starts_at = now(), ends_at = now() + make_interval(secs => duration_seconds)
    where id = matched_row.id;
    insert into public.duel_players(match_id, user_id) values (matched_row.id, uid);
    return matched_row.id;
  end if;

  question_list := private.duel_questions(chosen_subject);
  if coalesce(array_length(question_list, 1), 0) < 10 then raise exception 'Not enough questions for this subject'; end if;
  insert into public.duel_matches(match_type, mode, subject, created_by, player_one, question_ids)
  values ('ranked', chosen_mode, chosen_subject, uid, uid, question_list)
  returning id into created_id;
  insert into public.duel_players(match_id, user_id) values (created_id, uid);
  return created_id;
end;
$$;

create or replace function public.duel_create_private(chosen_mode text, chosen_subject text)
returns table(match_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  created_id uuid;
  created_code text;
  question_list uuid[];
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if chosen_mode not in ('quick', 'rush') or chosen_subject not in ('math', 'reading_writing') then raise exception 'Invalid duel settings'; end if;
  question_list := private.duel_questions(chosen_subject);
  if coalesce(array_length(question_list, 1), 0) < 10 then raise exception 'Not enough questions for this subject'; end if;
  created_code := private.duel_room_code();
  insert into public.duel_matches(room_code, match_type, mode, subject, created_by, player_one, question_ids)
  values (created_code, 'private', chosen_mode, chosen_subject, uid, uid, question_list)
  returning id into created_id;
  insert into public.duel_players(match_id, user_id) values (created_id, uid);
  return query select created_id, created_code;
end;
$$;

create or replace function public.duel_join_private(join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  matched_row public.duel_matches%rowtype;
  duration_seconds integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into matched_row from public.duel_matches
  where room_code = upper(btrim(join_code)) and match_type = 'private' and status = 'waiting'
  for update;
  if matched_row.id is null then raise exception 'Room not found or already started'; end if;
  if matched_row.player_one = uid then return matched_row.id; end if;
  duration_seconds := case when matched_row.mode = 'quick' then 180 else 300 end;
  update public.duel_matches set player_two = uid, status = 'active', starts_at = now(), ends_at = now() + make_interval(secs => duration_seconds)
  where id = matched_row.id;
  insert into public.duel_players(match_id, user_id) values (matched_row.id, uid);
  return matched_row.id;
end;
$$;

create or replace function public.duel_cancel(match_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  update public.duel_matches set status = 'cancelled', finished_at = now()
  where id = match_uuid and created_by = uid and status = 'waiting';
  return found;
end;
$$;

create or replace function public.duel_heartbeat(match_uuid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  match_row public.duel_matches%rowtype;
  other_seen timestamptz;
  both_present boolean;
  one_score integer;
  two_score integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into match_row from public.duel_matches where id = match_uuid and uid in (player_one, player_two) for update;
  if match_row.id is null or match_row.status in ('completed', 'cancelled', 'waiting') then return; end if;
  update public.duel_players set last_seen = now() where match_id = match_uuid and user_id = uid;
  select p.last_seen into other_seen from public.duel_players p where p.match_id = match_uuid and p.user_id <> uid;
  select count(*) = 2 into both_present from public.duel_players p where p.match_id = match_uuid and p.last_seen >= now() - interval '7 seconds';

  if match_row.status in ('active', 'sudden_death') and other_seen < now() - interval '7 seconds' then
    update public.duel_matches set status = 'paused', paused_at = now(), disconnect_deadline = now() + interval '30 seconds' where id = match_uuid;
    return;
  end if;
  if match_row.status = 'paused' then
    if match_row.disconnect_deadline <= now() then
      perform private.finish_duel(match_uuid, uid);
      return;
    elsif both_present then
      update public.duel_matches set status = case when ends_at is null then 'sudden_death' else 'active' end,
        ends_at = case when ends_at is null then null else ends_at + (now() - paused_at) end,
        paused_at = null, disconnect_deadline = null where id = match_uuid;
      return;
    end if;
  end if;

  if match_row.status = 'active' and match_row.ends_at <= now() then
    select score into one_score from public.duel_players where match_id = match_uuid and user_id = match_row.player_one;
    select score into two_score from public.duel_players where match_id = match_uuid and user_id = match_row.player_two;
    if match_row.mode = 'rush' and one_score <> two_score then
      perform private.finish_duel(match_uuid, case when one_score > two_score then match_row.player_one else match_row.player_two end);
    else
      update public.duel_matches set status = 'sudden_death', ends_at = null where id = match_uuid;
    end if;
  end if;
end;
$$;

create or replace function public.duel_submit_answer(match_uuid uuid, answer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  match_row public.duel_matches%rowtype;
  player_row public.duel_players%rowtype;
  question_row public.questions%rowtype;
  correct boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(btrim(coalesce(answer, ''))) > 200 then raise exception 'Answer is too long'; end if;
  perform public.duel_heartbeat(match_uuid);
  select * into match_row from public.duel_matches where id = match_uuid and uid in (player_one, player_two) for update;
  if match_row.status not in ('active', 'sudden_death') then raise exception 'The duel is not accepting answers'; end if;
  select * into player_row from public.duel_players where match_id = match_uuid and user_id = uid for update;
  if player_row.question_index >= array_length(match_row.question_ids, 1) then raise exception 'No questions left'; end if;
  select * into question_row from public.questions where id = match_row.question_ids[player_row.question_index + 1];
  correct := private.duel_answer_is_correct(answer, question_row.correct_answer);
  insert into public.duel_answers(match_id, user_id, question_index, question_id, selected_answer, is_correct)
  values (match_uuid, uid, player_row.question_index, question_row.id, answer, correct);
  update public.duel_players set question_index = question_index + 1, score = score + case when correct then 1 else 0 end, last_seen = now()
  where match_id = match_uuid and user_id = uid;
  if correct and (match_row.mode = 'quick' or match_row.status = 'sudden_death') then
    perform private.finish_duel(match_uuid, uid);
  end if;
  return correct;
end;
$$;

create or replace function public.duel_get_state(match_uuid uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  match_row public.duel_matches%rowtype;
  me public.duel_players%rowtype;
  opponent public.duel_players%rowtype;
  question jsonb;
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform public.duel_heartbeat(match_uuid);
  select * into match_row from public.duel_matches where id = match_uuid and uid in (player_one, player_two);
  if match_row.id is null then raise exception 'Duel not found'; end if;
  select * into me from public.duel_players where match_id = match_uuid and user_id = uid;
  select * into opponent from public.duel_players where match_id = match_uuid and user_id <> uid;
  if match_row.status in ('active', 'sudden_death') and me.question_index < array_length(match_row.question_ids, 1) then
    select jsonb_build_object(
      'id', q.id, 'section', q.section, 'domain', q.domain, 'skill', q.skill, 'difficulty', q.difficulty,
      'is_grid_in', q.is_grid_in, 'question_text', q.question_text, 'question_text_html', q.question_text_html,
      'passage', q.passage, 'passage_html', q.passage_html, 'choices', q.choices
    ) into question from public.questions q where q.id = match_row.question_ids[me.question_index + 1];
  end if;
  select jsonb_build_object(
    'id', match_row.id, 'roomCode', match_row.room_code, 'matchType', match_row.match_type,
    'mode', match_row.mode, 'subject', match_row.subject, 'status', match_row.status,
    'startsAt', match_row.starts_at, 'endsAt', match_row.ends_at, 'disconnectDeadline', match_row.disconnect_deadline,
    'winnerId', match_row.winner_id,
    'me', jsonb_build_object('id', uid, 'name', coalesce((select p.username from public.profiles p where p.id = uid), 'You'), 'score', me.score, 'questionIndex', me.question_index, 'rating', coalesce((select r.rating from public.duel_ratings r where r.user_id = uid), 1000)),
    'opponent', case when opponent.user_id is null then null else jsonb_build_object('id', opponent.user_id, 'name', coalesce((select p.username from public.profiles p where p.id = opponent.user_id), 'Opponent'), 'score', opponent.score, 'questionIndex', opponent.question_index, 'rating', coalesce((select r.rating from public.duel_ratings r where r.user_id = opponent.user_id), 1000)) end,
    'question', question
  ) into result;
  return result;
end;
$$;

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
  choices jsonb,
  correct_answer text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select q.id, q.section::text, q.domain::text, q.skill::text, q.difficulty::text, q.is_grid_in,
    q.question_text, q.question_text_html, q.passage, q.passage_html, q.choices, q.correct_answer
  from public.questions q
  where chosen_subject in ('math', 'reading_writing')
    and q.section::text = chosen_subject and q.is_official and q.usable
  order by random()
  limit 24
$$;

revoke all on function private.duel_questions(text), private.duel_room_code(), private.duel_answer_is_correct(text, text), private.finish_duel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.duel_profile(), public.duel_find_ranked(text, text), public.duel_create_private(text, text), public.duel_join_private(text), public.duel_cancel(uuid), public.duel_heartbeat(uuid), public.duel_submit_answer(uuid, text), public.duel_get_state(uuid), public.guest_duel_questions(text) from public, anon, authenticated;
grant execute on function public.duel_profile(), public.duel_find_ranked(text, text), public.duel_create_private(text, text), public.duel_join_private(text), public.duel_cancel(uuid), public.duel_heartbeat(uuid), public.duel_submit_answer(uuid, text), public.duel_get_state(uuid) to authenticated;
grant execute on function public.guest_duel_questions(text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.duel_matches;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.duel_players;
exception when duplicate_object then null;
end $$;

commit;
