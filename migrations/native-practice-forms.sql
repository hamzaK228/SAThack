begin;

create table public.practice_forms (
  id text primary key check (id ~ '^digital-[0-9]{2}$'),
  title text not null,
  sequence integer not null unique check (sequence between 1 and 10),
  modules jsonb not null,
  published boolean not null default true
);
alter table public.practice_forms enable row level security;
create policy practice_forms_read on public.practice_forms for select to authenticated using (published);
grant select on public.practice_forms to authenticated;
revoke insert, update, delete on public.practice_forms from anon, authenticated;

do $$
declare
  f integer;
  rw_easy uuid[]; rw_medium uuid[]; rw_hard uuid[];
  math_easy uuid[]; math_medium uuid[]; math_hard uuid[];
  rw1 jsonb; rw2_easy jsonb; rw2_hard jsonb;
  math1 jsonb; math2_easy jsonb; math2_hard jsonb;
begin
  select array_agg(id order by md5(id::text || ':rw-easy-v1')) into rw_easy
    from public.questions where is_official and usable and section::text='reading_writing' and difficulty::text='easy';
  select array_agg(id order by md5(id::text || ':rw-medium-v1')) into rw_medium
    from public.questions where is_official and usable and section::text='reading_writing' and difficulty::text='medium';
  select array_agg(id order by md5(id::text || ':rw-hard-v1')) into rw_hard
    from public.questions where is_official and usable and section::text='reading_writing' and difficulty::text='hard';
  select array_agg(id order by md5(id::text || ':math-easy-v1')) into math_easy
    from public.questions where is_official and usable and section::text='math' and difficulty::text='easy';
  select array_agg(id order by md5(id::text || ':math-medium-v1')) into math_medium
    from public.questions where is_official and usable and section::text='math' and difficulty::text='medium';
  select array_agg(id order by md5(id::text || ':math-hard-v1')) into math_hard
    from public.questions where is_official and usable and section::text='math' and difficulty::text='hard';

  for f in 1..10 loop
    select jsonb_agg(id order by md5(id::text || f::text || ':rw1')) into rw1 from unnest(
      rw_easy[(f-1)*23+1:(f-1)*23+9] || rw_medium[(f-1)*35+1:(f-1)*35+9] || rw_hard[(f-1)*23+1:(f-1)*23+9]
    ) id;
    select jsonb_agg(id order by md5(id::text || f::text || ':rw2e')) into rw2_easy from unnest(
      rw_easy[(f-1)*23+10:f*23] || rw_medium[(f-1)*35+10:(f-1)*35+22]
    ) id;
    select jsonb_agg(id order by md5(id::text || f::text || ':rw2h')) into rw2_hard from unnest(
      rw_hard[(f-1)*23+10:f*23] || rw_medium[(f-1)*35+23:f*35]
    ) id;
    select jsonb_agg(id order by md5(id::text || f::text || ':math1')) into math1 from unnest(
      math_easy[(f-1)*19+1:(f-1)*19+7] || math_medium[(f-1)*28+1:(f-1)*28+8] || math_hard[(f-1)*19+1:(f-1)*19+7]
    ) id;
    select jsonb_agg(id order by md5(id::text || f::text || ':math2e')) into math2_easy from unnest(
      math_easy[(f-1)*19+8:f*19] || math_medium[(f-1)*28+9:(f-1)*28+18]
    ) id;
    select jsonb_agg(id order by md5(id::text || f::text || ':math2h')) into math2_hard from unnest(
      math_hard[(f-1)*19+8:f*19] || math_medium[(f-1)*28+19:f*28]
    ) id;

    insert into public.practice_forms(id,title,sequence,modules)
    values(
      'digital-' || lpad(f::text,2,'0'),
      'Digital SAT Practice Test ' || f,
      f,
      jsonb_build_object('rw1',rw1,'rw2Easy',rw2_easy,'rw2Hard',rw2_hard,
                         'math1',math1,'math2Easy',math2_easy,'math2Hard',math2_hard)
    );
  end loop;
end $$;

alter table public.assessments drop constraint assessments_kind_check;
alter table public.assessments add constraint assessments_kind_check check (kind in ('adaptive','diagnostic','practice'));
alter table public.assessments add column form_id text references public.practice_forms(id);
alter table public.assessments add constraint assessments_practice_form_check
  check ((kind='practice' and form_id is not null) or (kind<>'practice' and form_id is null));
create index assessments_user_form_status_idx on public.assessments(user_id,form_id,status,started_at desc);

create or replace function private.assessment(p_action text, p_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); s public.assessments; ids jsonb; md jsonb; qs jsonb;
  section_name text; kind_name text; count_needed int; minutes int; next_ids jsonb;
  correct_count int; total_count int; rw_correct int; math_correct int; rw_total int; math_total int;
  rw_score int; math_score int; breakdown jsonb; all_ids jsonb; entry record;
  form_name text; form_title text; form_modules jsonb; module_key text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if octet_length(p_payload::text)>50000 then raise exception 'Submission too large'; end if;
  if p_action in ('start','resume') then
    kind_name := p_payload->>'kind';
    form_name := nullif(p_payload->>'formId','');
    if kind_name not in ('adaptive','diagnostic','practice') or kind_name is null then raise exception 'Invalid test'; end if;
    if kind_name='practice' then
      select title,modules into form_title,form_modules from public.practice_forms where id=form_name and published;
      if form_modules is null then raise exception 'Practice form not found'; end if;
    else
      form_name := null;
    end if;
    perform pg_advisory_xact_lock(hashtextextended(uid::text||kind_name||coalesce(form_name,''),0));
    select * into s from public.assessments
      where user_id=uid and kind=kind_name and form_id is not distinct from form_name and status='in_progress'
      order by started_at desc limit 1 for update;
    if p_action='resume' and s.id is null then return null; end if;
    if p_action='start' then
      if (select count(*) from public.assessments where user_id=uid and started_at>now()-interval '1 hour')>=12 then raise exception 'Please wait before starting another test'; end if;
      update public.assessments set status='abandoned'
        where user_id=uid and kind=kind_name and form_id is not distinct from form_name and status='in_progress';
      if kind_name='practice' then
        ids := form_modules->'rw1';
        md := jsonb_build_object('ids',ids,'section','reading_writing','label','Reading & Writing - Module 1');
      else
        ids := private.pick_questions('reading_writing',case when kind_name='diagnostic' then 11 else 27 end,null,'[]');
        if kind_name='diagnostic' then ids := ids || private.pick_questions('math',11,null,'[]'); end if;
        if jsonb_array_length(ids) <> (case when kind_name='diagnostic' then 22 else 27 end) then raise exception 'Not enough questions available'; end if;
        md := jsonb_build_object('ids',ids,'section','reading_writing','label',case when kind_name='diagnostic' then 'Diagnostic' else 'Reading & Writing - Module 1' end);
      end if;
      insert into public.assessments(user_id,kind,form_id,modules,deadline)
        values(uid,kind_name,form_name,jsonb_build_array(md),case when kind_name in ('adaptive','practice') then now()+interval '32 minutes' else null end)
        returning * into s;
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
        select count(*),count(*) filter(where private.answer_matches(s.answers->>q.id::text,q.correct_answer))
          into total_count,correct_count from public.questions q where ids ? q.id::text;
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
          if s.kind='practice' then
            select modules,title into form_modules,form_title from public.practice_forms where id=s.form_id and published;
            module_key := case s.module_index
              when 1 then case when correct_count>=ceil(total_count*0.6) then 'rw2Hard' else 'rw2Easy' end
              when 2 then 'math1'
              when 3 then case when correct_count>=ceil(total_count*0.6) then 'math2Hard' else 'math2Easy' end
            end;
            next_ids := form_modules->module_key;
          else
            select coalesce(jsonb_agg(v),'[]') into all_ids from jsonb_array_elements(s.modules) m cross join lateral jsonb_array_elements_text(m->'ids') v;
            next_ids := private.pick_questions(section_name,count_needed,case when s.module_index in (1,3) then case when correct_count>=ceil(total_count*0.6) then 'hard' else 'easy' end else null end,all_ids);
          end if;
          if jsonb_array_length(next_ids)<>count_needed then raise exception 'Not enough questions available'; end if;
          s.modules := s.modules || jsonb_build_array(jsonb_build_object('ids',next_ids,'section',section_name,'label',
            case when section_name='math' then 'Math' else 'Reading & Writing' end || ' - Module ' || case when s.module_index in (1,3) then '2' else '1' end));
          s.deadline := now()+make_interval(mins=>minutes); s.question_index:=0; s.marked:='[]';
        end if;
      end if;
      update public.assessments set modules=s.modules,answers=s.answers,marked=s.marked,question_index=s.question_index,module_index=s.module_index,deadline=s.deadline,status=s.status,result=s.result where id=s.id;
    end if;
  end if;
  md := s.modules->s.module_index;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'section',q.section,'domain',q.domain,'skill',q.skill,'difficulty',q.difficulty,'is_grid_in',q.is_grid_in,'question_text',q.question_text,'question_text_html',q.question_text_html,'passage',q.passage,'passage_html',q.passage_html,'choices',q.choices) order by x.n),'[]') into qs
    from jsonb_array_elements_text(md->'ids') with ordinality x(id,n) join public.questions q on q.id=x.id::uuid;
  if s.form_id is not null then select title into form_title from public.practice_forms where id=s.form_id; end if;
  return jsonb_build_object('id',s.id,'kind',s.kind,'formId',s.form_id,'title',form_title,'status',s.status,'moduleIndex',s.module_index,'questionIndex',s.question_index,'answers',s.answers,'marked',s.marked,'deadline',s.deadline,'serverNow',now(),'result',s.result,'module',jsonb_build_object('label',md->>'label','section',md->>'section','questions',qs));
end $$;

drop policy if exists practice_asset_read on storage.objects;
drop table public.digital_test_progress;
drop table public.practice_test_catalog;

commit;
