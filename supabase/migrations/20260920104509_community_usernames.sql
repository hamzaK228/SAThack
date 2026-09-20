begin;

alter table public.profiles add column username text;

with candidates as (
  select
    p.id,
    lower(u.raw_user_meta_data ->> 'username') as username,
    row_number() over (
      partition by lower(u.raw_user_meta_data ->> 'username')
      order by p.created_at, p.id
    ) as candidate_rank
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(coalesce(u.raw_user_meta_data ->> 'username', '')) ~ '^[a-z0-9_]{3,24}$'
)
update public.profiles p
set username = candidates.username
from candidates
where p.id = candidates.id and candidates.candidate_rank = 1;

update public.profiles
set username = 'student_' || left(replace(id::text, '-', ''), 16)
where username is null;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  add constraint profiles_username_unique unique (username);

revoke insert, update on public.profiles from authenticated, anon;
grant insert(id, full_name, username, target_score, current_score, test_date, ai_model),
  update(full_name, username, target_score, current_score, test_date, ai_model)
on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if requested_username !~ '^[a-z0-9_]{3,24}$' then
    requested_username := 'student_' || left(replace(new.id::text, '-', ''), 16);
  end if;

  insert into public.profiles (id, full_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    requested_username
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    lower(coalesce(candidate, '')) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1 from public.profiles p where p.username = lower(candidate)
    )
$$;

revoke all on function public.is_username_available(text) from public, anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.search_community_users(search_query text)
returns table(id uuid, username text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, coalesce(nullif(btrim(p.full_name), ''), 'SAT Student')
  from public.profiles p
  where (select auth.uid()) is not null
    and length(btrim(coalesce(search_query, ''))) between 2 and 24
    and p.username like lower(btrim(search_query)) || '%'
  order by (p.username = lower(btrim(search_query))) desc, p.username
  limit 10
$$;

revoke all on function public.search_community_users(text) from public, anon, authenticated;
grant execute on function public.search_community_users(text) to authenticated;

create or replace function private.community_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select username from public.profiles where id = uid
$$;

update public.community_groups g
set owner_name = p.username
from public.profiles p
where p.id = g.owner_id;

update public.community_posts post
set author_name = p.username
from public.profiles p
where p.id = post.author_id;

update public.community_comments comment
set author_name = p.username
from public.profiles p
where p.id = comment.author_id;

commit;
