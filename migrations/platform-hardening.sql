begin;
-- Keep profile roles out of client-writable columns.
revoke insert,update on public.profiles from authenticated,anon;
grant insert(id,full_name,target_score,current_score,test_date,ai_model),update(full_name,target_score,current_score,test_date,ai_model) on public.profiles to authenticated;

do $$ declare t text; p record; owner_column text;
begin
  foreach t in array array['profiles','study_plans','plan_tasks','practice_attempts','test_sessions','diagnostics','saved_questions','vocab_progress'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    owner_column := case when t='profiles' then 'id' else 'user_id' end;
    execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=%I) with check ((select auth.uid())=%I)',t,owner_column,owner_column);
  end loop;
end $$;
drop index if exists public.questions_section_domain_difficulty_idx;
drop index if exists public.vocab_progress_due_idx;
alter table public.vocab_progress drop constraint if exists vocab_progress_user_word_key;

create or replace function public.question_bank_summary(p_sources text[] default null)
returns table(section text,domain text,skill text,difficulty text,total bigint,answered bigint,solved bigint,missed bigint)
language sql stable security invoker set search_path='' as $$
  with statuses as (
    select question_id,bool_or(is_correct) solved,bool_or(not is_correct) missed
    from public.practice_attempts where user_id=(select auth.uid()) group by question_id
  ) select q.section::text,q.domain,q.skill,q.difficulty::text,count(*),count(s.question_id),count(*) filter(where s.solved),count(*) filter(where s.missed)
    from public.questions q left join statuses s on s.question_id=q.id
    where q.is_official and q.usable and (p_sources is null or q.source_id=any(p_sources))
    group by q.section,q.domain,q.skill,q.difficulty
$$;
revoke all on function public.question_bank_summary(text[]) from public,anon;
grant execute on function public.question_bank_summary(text[]) to authenticated;

create table if not exists private.ai_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null, calls int not null default 0, last_call timestamptz not null,
 primary key(user_id,day)
);
alter table private.ai_usage enable row level security;
create or replace function private.consume_ai_quota() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n int;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into private.ai_usage(user_id,day,calls,last_call) values(uid,(now() at time zone 'UTC')::date,1,now())
 on conflict(user_id,day) do update set calls=private.ai_usage.calls+1,last_call=now()
 where private.ai_usage.calls<50 and private.ai_usage.last_call<now()-interval '3 seconds'
 returning calls into n;
 return n is not null;
end $$;
create or replace function public.consume_ai_quota() returns boolean language sql security invoker set search_path='' as $$ select private.consume_ai_quota() $$;
revoke all on function private.consume_ai_quota(),public.consume_ai_quota() from public,anon;
grant execute on function private.consume_ai_quota(),public.consume_ai_quota() to authenticated;

create table if not exists public.practice_test_catalog (
 id text primary key, title text not null, year text not null, filename text not null,
 size bigint not null, answer_key boolean not null default false,
 storage_path text not null, manifest jsonb, published boolean not null default false
);
alter table public.practice_test_catalog enable row level security;
create policy catalog_read on public.practice_test_catalog for select to authenticated using(published);
grant select on public.practice_test_catalog to authenticated;
revoke insert,update,delete on public.practice_test_catalog from authenticated,anon;
create table if not exists public.digital_test_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 test_id text not null, progress jsonb not null check(octet_length(progress::text)<100000),
 updated_at timestamptz not null default now(), primary key(user_id,test_id)
);
alter table public.digital_test_progress enable row level security;
create policy progress_owner on public.digital_test_progress for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert,update,delete on public.digital_test_progress to authenticated;
commit;
