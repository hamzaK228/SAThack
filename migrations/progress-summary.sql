begin;
grant update(id) on public.profiles to authenticated;
create or replace function public.progress_summary() returns jsonb
language sql stable security invoker set search_path='' as $$
 with a as (select * from public.practice_attempts where user_id=(select auth.uid())),
 days as (select (created_at at time zone 'UTC')::date as activity_date,count(*) n from a group by 1)
 select jsonb_build_object(
  'attempts',(select count(*) from a),'correct',(select count(*) from a where is_correct),
  'tests',(select count(*) from public.test_sessions where user_id=(select auth.uid()) and status='completed'),
  'vocabReviews',(select count(*) from public.vocab_progress where user_id=(select auth.uid()) and times_seen>0),
  'days',coalesce((select jsonb_object_agg(activity_date,n) from days),'{}'),
  'recent',coalesce((select jsonb_agg(row_to_json(r)) from (select domain,is_correct,created_at from a order by created_at desc limit 6) r),'[]')
 )
$$;
revoke all on function public.progress_summary() from public,anon;
grant execute on function public.progress_summary() to authenticated;
create policy practice_asset_read on storage.objects for select to authenticated
 using(bucket_id='practice-tests' and exists(select 1 from public.practice_test_catalog c where c.published and c.id=(storage.foldername(name))[1]));
alter function public.is_admin() security invoker;
commit;
