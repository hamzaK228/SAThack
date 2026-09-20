begin;
update public.questions set usable = (length(btrim(coalesce(question_text,''))) > 0 and length(btrim(coalesce(correct_answer,''))) > 0 and (is_grid_in or jsonb_array_length(choices::jsonb)>=2)) where usable is null;
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.numeric_answer(value text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare parts text[];
begin
  if btrim(value) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then return btrim(value)::numeric; end if;
  parts := regexp_match(btrim(value), '^([+-]?[0-9]+)\s*/\s*([0-9]+)$');
  if parts is not null and parts[2]::numeric <> 0 then return parts[1]::numeric / parts[2]::numeric; end if;
  return null;
exception when others then return null;
end $$;

create or replace function private.answer_matches(selected text, expected text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(length(btrim(selected)) > 0 and exists (
    select 1 from regexp_split_to_table(expected, ',\s+') accepted
    where lower(btrim(selected)) = lower(btrim(accepted))
       or abs(private.numeric_answer(selected) - private.numeric_answer(accepted)) < 0.000001
  ), false)
$$;

create or replace function private.grade_attempt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare q public.questions;
begin
  select * into q from public.questions where id = new.question_id and is_official and usable;
  if not found or length(coalesce(new.selected_answer,'')) > 200 then raise exception 'Invalid question or answer'; end if;
  new.correct_answer := q.correct_answer;
  new.is_correct := private.answer_matches(new.selected_answer, q.correct_answer);
  new.section := q.section;
  new.domain := q.domain;
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end $$;
drop trigger if exists grade_attempt on public.practice_attempts;
create trigger grade_attempt before insert or update on public.practice_attempts
for each row execute function private.grade_attempt();

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('adaptive','diagnostic')),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  module_index integer not null default 0,
  modules jsonb not null default '[]',
  answers jsonb not null default '{}',
  marked jsonb not null default '[]',
  question_index integer not null default 0,
  deadline timestamptz,
  result jsonb,
  started_at timestamptz not null default now()
);
alter table public.assessments enable row level security;
create policy assessments_read on public.assessments for select to authenticated using ((select auth.uid())=user_id);
grant select on public.assessments to authenticated;
revoke insert, update, delete on public.assessments from anon, authenticated;
create index if not exists assessments_user_status_idx on public.assessments(user_id,kind,status,started_at desc);

create or replace function private.pick_questions(p_section text, p_count int, p_difficulty text, p_exclude jsonb)
returns jsonb language sql volatile set search_path = '' as $$
  select coalesce(jsonb_agg(id order by random()),'[]') from (
    select id from (
      select q.id, row_number() over(partition by q.domain order by
        exists(select 1 from public.practice_attempts a where a.user_id=auth.uid() and a.question_id=q.id and a.created_at > now()-interval '30 days'), random()) n
      from public.questions q where q.is_official and q.usable
        and length(btrim(coalesce(q.question_text,''))) > 0
        and q.section::text=p_section and not (p_exclude ? q.id::text)
        and (p_difficulty is null or q.difficulty::text in ('medium',p_difficulty))
    ) ranked order by n,random() limit p_count
  ) chosen
$$;

create or replace function private.assessment(p_action text, p_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); s public.assessments; ids jsonb; md jsonb; qs jsonb;
  section_name text; kind_name text; count_needed int; minutes int; next_ids jsonb;
  correct_count int; total_count int; rw_correct int; math_correct int; rw_total int; math_total int;
  rw_score int; math_score int; breakdown jsonb; all_ids jsonb; entry record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if octet_length(p_payload::text)>50000 then raise exception 'Submission too large'; end if;
  if p_action in ('start','resume') then
    kind_name := p_payload->>'kind';
    if kind_name not in ('adaptive','diagnostic') or kind_name is null then raise exception 'Invalid test'; end if;
    perform pg_advisory_xact_lock(hashtextextended(uid::text||kind_name,0));
    select * into s from public.assessments where user_id=uid and kind=kind_name and status='in_progress' order by started_at desc limit 1 for update;
    if p_action='resume' and s.id is null then return null; end if;
    if p_action='start' then
      if (select count(*) from public.assessments where user_id=uid and started_at>now()-interval '1 hour')>=12 then raise exception 'Please wait before starting another test'; end if;
      update public.assessments set status='abandoned' where user_id=uid and kind=kind_name and status='in_progress';
      ids := private.pick_questions('reading_writing',case when kind_name='diagnostic' then 11 else 27 end,null,'[]');
      if kind_name='diagnostic' then ids := ids || private.pick_questions('math',11,null,'[]'); end if;
      if jsonb_array_length(ids) <> (case when kind_name='diagnostic' then 22 else 27 end) then raise exception 'Not enough questions available'; end if;
      md := jsonb_build_object('ids',ids,'section','reading_writing','label',case when kind_name='diagnostic' then 'Diagnostic' else 'Reading & Writing - Module 1' end);
      insert into public.assessments(user_id,kind,modules,deadline) values(uid,kind_name,jsonb_build_array(md),case when kind_name='adaptive' then now()+interval '32 minutes' else null end) returning * into s;
    end if;
  else
    select * into s from public.assessments where id=p_id and user_id=uid for update;
    if not found then raise exception 'Test not found'; end if;
    if p_action not in ('save','advance') then raise exception 'Invalid action'; end if;
    if s.status='abandoned' then raise exception 'This test was replaced by a new test'; end if;
    if s.status='in_progress' and (p_payload->>'moduleIndex')::int=s.module_index then
      ids := s.modules->s.module_index->'ids';
      if s.deadline is null or now() <= s.deadline then
        if jsonb_typeof(p_payload->'answers') <> 'object' then raise exception 'Invalid answers'; end if;
        for entry in select key,value from jsonb_each_text(p_payload->'answers') loop
          if not (ids ? entry.key) or length(entry.value)>200 then raise exception 'Invalid answer'; end if;
        end loop;
        s.answers := s.answers || coalesce(p_payload->'answers','{}');
      end if;
      s.marked := coalesce(p_payload->'marked','[]');
      s.question_index := greatest(0,least(coalesce((p_payload->>'questionIndex')::int,0),jsonb_array_length(ids)-1));
      if p_action='advance' then
        insert into public.practice_attempts(user_id,question_id,selected_answer,mode)
          select uid, q.id, s.answers->>q.id::text, case when s.kind='diagnostic' then 'module'::public.attempt_mode else 'full_test'::public.attempt_mode end
          from public.questions q where ids ? q.id::text;
        select count(*),count(*) filter(where private.answer_matches(s.answers->>q.id::text,q.correct_answer)) into total_count,correct_count from public.questions q where ids ? q.id::text;
        if s.kind='diagnostic' or s.module_index=3 then
          select jsonb_agg(v) into all_ids from jsonb_array_elements(s.modules) m cross join lateral jsonb_array_elements_text(m->'ids') v;
          select count(*) filter(where section='reading_writing'),count(*) filter(where section='math'),
            count(*) filter(where section='reading_writing' and private.answer_matches(s.answers->>id::text,correct_answer)),
            count(*) filter(where section='math' and private.answer_matches(s.answers->>id::text,correct_answer))
            into rw_total,math_total,rw_correct,math_correct from public.questions where all_ids ? id::text;
          rw_score := 200+10*round(60.0*rw_correct/greatest(1,rw_total));
          math_score := 200+10*round(60.0*math_correct/greatest(1,math_total));
          s.result := jsonb_build_object('rwCorrect',rw_correct,'mathCorrect',math_correct,'rwTotal',rw_total,'mathTotal',math_total,'rwScore',rw_score,'mathScore',math_score,'total',rw_score+math_score);
          if s.kind='diagnostic' then
            select jsonb_object_agg(domain,jsonb_build_object('correct',n,'total',t)) into breakdown from (
              select domain,count(*) t,count(*) filter(where private.answer_matches(s.answers->>id::text,correct_answer)) n from public.questions where all_ids ? id::text group by domain
            ) d;
            insert into public.diagnostics(user_id,rw_score,math_score,total_score,rw_module1_raw,math_module1_raw,domain_breakdown,completed_at)
              values(uid,rw_score,math_score,rw_score+math_score,rw_correct,math_correct,breakdown,now());
            update public.profiles set current_score=rw_score+math_score where id=uid and current_score is null;
          else
            insert into public.test_sessions(user_id,status,current_module,rw_correct,math_correct,rw_score,math_score,total_score,started_at,completed_at)
              values(uid,'completed','done',rw_correct,math_correct,rw_score,math_score,rw_score+math_score,s.started_at,now());
          end if;
          s.status := 'completed'; s.deadline := null;
        else
          s.module_index := s.module_index+1;
          section_name := case when s.module_index<2 then 'reading_writing' else 'math' end;
          count_needed := case when section_name='math' then 22 else 27 end;
          minutes := case when section_name='math' then 35 else 32 end;
          select coalesce(jsonb_agg(v),'[]') into all_ids from jsonb_array_elements(s.modules) m cross join lateral jsonb_array_elements_text(m->'ids') v;
          next_ids := private.pick_questions(section_name,count_needed,case when s.module_index in (1,3) then case when correct_count>=ceil(total_count*0.6) then 'hard' else 'easy' end else null end,all_ids);
          if jsonb_array_length(next_ids)<>count_needed then raise exception 'Not enough questions available'; end if;
          s.modules := s.modules || jsonb_build_array(jsonb_build_object('ids',next_ids,'section',section_name,'label',case when section_name='math' then 'Math' else 'Reading & Writing' end || ' - Module ' || case when s.module_index in (1,3) then '2' else '1' end));
          s.deadline := now()+make_interval(mins=>minutes); s.question_index:=0; s.marked:='[]';
        end if;
      end if;
      update public.assessments set modules=s.modules,answers=s.answers,marked=s.marked,question_index=s.question_index,module_index=s.module_index,deadline=s.deadline,status=s.status,result=s.result where id=s.id;
    end if;
  end if;
  md := s.modules->s.module_index;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'section',q.section,'domain',q.domain,'skill',q.skill,'difficulty',q.difficulty,'is_grid_in',q.is_grid_in,'question_text',q.question_text,'question_text_html',q.question_text_html,'passage',q.passage,'passage_html',q.passage_html,'choices',q.choices) order by x.n),'[]') into qs
    from jsonb_array_elements_text(md->'ids') with ordinality x(id,n) join public.questions q on q.id=x.id::uuid;
  return jsonb_build_object('id',s.id,'kind',s.kind,'status',s.status,'moduleIndex',s.module_index,'questionIndex',s.question_index,'answers',s.answers,'marked',s.marked,'deadline',s.deadline,'serverNow',now(),'result',s.result,'module',jsonb_build_object('label',md->>'label','section',md->>'section','questions',qs));
end $$;
create or replace function public.assessment(p_action text,p_id uuid default null,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.assessment(p_action,p_id,p_payload) $$;
revoke all on function public.assessment(text,uuid,jsonb) from public,anon;
revoke all on all functions in schema private from public,anon;
grant execute on function private.assessment(text,uuid,jsonb),public.assessment(text,uuid,jsonb) to authenticated;

-- Completed scores may only be written by the assessment transaction.
revoke insert,update on public.test_sessions,public.diagnostics from authenticated,anon;
revoke update on public.practice_attempts from authenticated,anon;
grant update(reviewed,rule_note) on public.practice_attempts to authenticated;
revoke all on function public.bank_overview(public.question_section),public.is_admin(),public.leaderboard(integer) from public,anon;
grant execute on function public.bank_overview(public.question_section),public.is_admin(),public.leaderboard(integer) to authenticated;
alter function public.bank_overview(public.question_section) security invoker;
create index if not exists plan_tasks_plan_id_idx on public.plan_tasks(plan_id);
create index if not exists saved_questions_question_id_idx on public.saved_questions(question_id);
create index if not exists study_plans_diagnostic_id_idx on public.study_plans(diagnostic_id);
create index if not exists vocab_progress_word_id_idx on public.vocab_progress(word_id);
commit;
