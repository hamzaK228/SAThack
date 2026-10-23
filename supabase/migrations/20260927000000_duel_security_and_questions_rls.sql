-- Duel hardening + questions RLS codification.
--
-- 1. guest_duel_questions no longer returns correct_answer. The guest trial
--    grades answers through guest_duel_check_answer (server-side), so the
--    official answer key can no longer be exfiltrated by anonymous callers.
-- 2. duel_heartbeat: when a paused match's disconnect deadline passes, the
--    win used to go to whoever called heartbeat next — a disconnected player
--    who reconnected just after the deadline was crowned the winner. The win
--    now goes to the player who stayed connected.
-- 3. questions/vocab_words SELECT policies are codified here so a fresh
--    deploy matches the live database (they previously only existed by hand).

-- ---------------------------------------------------------------------------
-- 1. Guest duel: questions without the answer key, grading stays server-side
-- ---------------------------------------------------------------------------

drop function if exists public.guest_duel_questions(text);

create function public.guest_duel_questions(chosen_subject text)
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
volatile
security definer
set search_path = ''
as $$
  select q.id, q.section::text, q.domain::text, q.skill::text, q.difficulty::text, q.is_grid_in,
    q.question_text, q.question_text_html, q.passage, q.passage_html, q.choices
  from public.questions q
  where chosen_subject in ('math', 'reading_writing')
    and q.section::text = chosen_subject and q.is_official and q.usable
  order by random()
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
  -- v_correct (not correct_answer): a plpgsql variable named like the column
  -- would shadow it and make the select return NULL for every row.
  select q.correct_answer into v_correct from public.questions q
    where q.id = p_question_id
      and q.is_official and q.usable
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
-- 2. Heartbeat: the connected player wins a deadline forfeit, not the caller
-- ---------------------------------------------------------------------------

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
      -- The deadline has passed: whoever is still here wins. That is the
      -- *other* player when the caller is the one who returned late, and the
      -- caller themselves when they never left.
      perform private.finish_duel(match_uuid, (
        select p.user_id from public.duel_players p
        where p.match_id = match_uuid
          and p.user_id <> uid
          and p.last_seen < now() - interval '7 seconds'
        limit 1
      ));
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

-- ---------------------------------------------------------------------------
-- 3. Codify the read policies that only existed in the live database
-- ---------------------------------------------------------------------------

drop policy if exists "questions_read" on public.questions;
create policy "questions_read"
  on public.questions for select
  to authenticated
  using (true);

drop policy if exists "vocab_read" on public.vocab_words;
create policy "vocab_read"
  on public.vocab_words for select
  to authenticated
  using (true);
