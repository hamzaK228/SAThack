-- Runs against the linked schema, rolls every test write back.
begin;
do $$ declare s jsonb; previous jsonb; first_id uuid; answer_key text; i int; count_before bigint; uid uuid;
begin
 select id into uid from auth.users order by created_at limit 1;
 if uid is null then raise exception 'A test account is required'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if private.answer_matches('', '0') or private.answer_matches('1/0','0') or private.answer_matches('wrong','A') then raise exception 'Invalid numeric grading'; end if;
 if not private.answer_matches('1/2','0.5') or not private.answer_matches('2','1, 2') then raise exception 'Equivalent answer rejected'; end if;
 s:=public.assessment('start',null,'{"kind":"adaptive"}');
 if jsonb_array_length(s->'module'->'questions')<>27 or s->'module'->'questions'->0 ? 'correct_answer' then raise exception 'Question payload invalid'; end if;
 previous:=public.assessment('resume',null,'{"kind":"adaptive"}');
 if previous->'deadline'<>s->'deadline' or previous->'module'<>s->'module' then raise exception 'Resume changed the test'; end if;
 first_id:=(s->'module'->'questions'->0->>'id')::uuid;
 select correct_answer into answer_key from public.questions where id=first_id;
 s:=public.assessment('save',(s->>'id')::uuid,jsonb_build_object('moduleIndex',0,'answers',jsonb_build_object(first_id,answer_key)));
 update public.assessments set deadline=now()-interval '1 second' where id=(s->>'id')::uuid;
 s:=public.assessment('save',(s->>'id')::uuid,jsonb_build_object('moduleIndex',0,'answers',jsonb_build_object(first_id,'wrong')));
 if s->'answers'->>first_id::text<>answer_key then raise exception 'Expired test accepted an answer'; end if;
 for i in 0..3 loop s:=public.assessment('advance',(s->>'id')::uuid,jsonb_build_object('moduleIndex',i,'answers','{}'::jsonb)); end loop;
 if s->>'status'<>'completed' or (s->'result'->>'rwCorrect')::int<>1 then raise exception 'Incorrect test result'; end if;
 select count(*) into count_before from public.practice_attempts where user_id=uid;
 previous:=public.assessment('advance',(s->>'id')::uuid,'{"moduleIndex":3,"answers":{}}');
 if (select count(*) from public.practice_attempts where user_id=uid)<>count_before then raise exception 'Repeated submission duplicated attempts'; end if;
 s:=public.assessment('start',null,'{"kind":"diagnostic"}');
 s:=public.assessment('advance',(s->>'id')::uuid,'{"moduleIndex":0,"answers":{}}');
 if (s->'result'->>'total')::int<>400 or (s->'result'->>'rwTotal')::int<>11 or (s->'result'->>'mathTotal')::int<>11 then raise exception 'Diagnostic scoring failed'; end if;
 s:=public.assessment('start',null,'{"kind":"practice","formId":"digital-01"}');
 if s->>'formId'<>'digital-01' or s->>'title'<>'Digital SAT Practice Test 1' or jsonb_array_length(s->'module'->'questions')<>27 then raise exception 'Digital practice form failed to start'; end if;
 previous:=public.assessment('resume',null,'{"kind":"practice","formId":"digital-01"}');
 if previous->'module'<>s->'module' then raise exception 'Digital practice form changed on resume'; end if;
 for i in 0..3 loop s:=public.assessment('advance',(s->>'id')::uuid,jsonb_build_object('moduleIndex',i,'answers','{}'::jsonb)); end loop;
 if s->>'status'<>'completed' or (s->'result'->>'rwTotal')::int<>54 or (s->'result'->>'mathTotal')::int<>44 then raise exception 'Digital practice form scoring failed'; end if;
 begin
  perform public.assessment('save',gen_random_uuid(),'{"moduleIndex":0,"answers":{}}');
  raise exception 'Unauthorized test accepted' using errcode='XX000';
 exception when raise_exception then null; end;
end $$;
set local role authenticated;
do $$ declare q uuid; ok boolean;
begin
 select id into q from public.questions where usable limit 1;
 insert into public.practice_attempts(user_id,question_id,selected_answer,correct_answer,is_correct,mode)
 values(auth.uid(),q,'deliberately wrong','deliberately wrong',true,'drill') returning is_correct into ok;
 if ok then raise exception 'Client grading was trusted'; end if;
 begin
  update public.profiles set role='admin' where id=auth.uid();
  raise exception 'Role mutation allowed' using errcode='XX000';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.test_sessions(user_id,total_score,status) values(auth.uid(),1600,'completed');
  raise exception 'Score forgery allowed' using errcode='XX000';
 exception when insufficient_privilege then null; end;
 if public.progress_summary() is null then raise exception 'Progress summary unavailable'; end if;
 if (select count(*) from public.practice_forms where published)<>10 then raise exception 'Expected ten published digital tests'; end if;
end $$;
rollback;
