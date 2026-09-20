begin;

create schema if not exists private;

create table public.community_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 3 and 56),
  name text not null check (length(btrim(name)) between 3 and 48),
  description text not null default '' check (length(description) <= 240),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null,
  member_count integer not null default 0 check (member_count >= 0),
  created_at timestamptz not null default now()
);

create table public.community_group_members (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  group_id uuid references public.community_groups(id) on delete cascade,
  kind text not null default 'discussion' check (kind in ('discussion', 'question', 'resource')),
  title text not null check (length(btrim(title)) between 4 and 120),
  body text not null check (length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (length(btrim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);

create table public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'unsafe', 'other')),
  created_at timestamptz not null default now(),
  unique (reporter_id, post_id)
);

create index community_posts_feed_idx on public.community_posts (group_id, created_at desc);
create index community_posts_author_idx on public.community_posts (author_id);
create index community_comments_post_idx on public.community_comments (post_id, created_at);
create index community_comments_author_idx on public.community_comments (author_id);
create index community_members_user_idx on public.community_group_members (user_id, joined_at desc);
create index community_groups_owner_idx on public.community_groups (owner_id);
create index community_reactions_user_idx on public.community_reactions (user_id);
create index community_reports_post_idx on public.community_reports (post_id);
create index if not exists assessments_form_id_idx on public.assessments (form_id);

create or replace function private.community_name(uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select left(coalesce(nullif(btrim(full_name), ''), 'SAT Student'), 40)
  from public.profiles where id = uid
$$;

create or replace function private.set_community_group_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.owner_id := auth.uid();
  new.owner_name := coalesce(private.community_name(auth.uid()), 'SAT Student');
  return new;
end $$;

create or replace function private.set_community_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.author_id := auth.uid();
  new.author_name := coalesce(private.community_name(auth.uid()), 'SAT Student');
  return new;
end $$;

create or replace function private.add_community_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_group_members(group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create or replace function private.update_community_member_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.community_groups
  set member_count = (select count(*) from public.community_group_members where group_id = coalesce(new.group_id, old.group_id))
  where id = coalesce(new.group_id, old.group_id);
  return coalesce(new, old);
end $$;

create trigger community_group_identity before insert on public.community_groups
for each row execute function private.set_community_group_identity();
create trigger community_group_owner after insert on public.community_groups
for each row execute function private.add_community_owner();
create trigger community_post_identity before insert on public.community_posts
for each row execute function private.set_community_author();
create trigger community_comment_identity before insert on public.community_comments
for each row execute function private.set_community_author();
create trigger community_member_count after insert or delete on public.community_group_members
for each row execute function private.update_community_member_count();

alter table public.community_groups enable row level security;
alter table public.community_group_members enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;

create policy community_groups_read on public.community_groups for select to authenticated using (true);
create policy community_groups_create on public.community_groups for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy community_groups_owner_update on public.community_groups for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy community_groups_owner_delete on public.community_groups for delete to authenticated using ((select auth.uid()) = owner_id);

create policy community_members_read_own on public.community_group_members for select to authenticated using ((select auth.uid()) = user_id);
create policy community_members_join on public.community_group_members for insert to authenticated
  with check ((select auth.uid()) = user_id and role = 'member');
create policy community_members_leave on public.community_group_members for delete to authenticated
  using ((select auth.uid()) = user_id and role = 'member');

create policy community_posts_read on public.community_posts for select to authenticated using (true);
create policy community_posts_create on public.community_posts for insert to authenticated
  with check (
    (select auth.uid()) = author_id and
    (group_id is null or exists (
      select 1 from public.community_group_members m
      where m.group_id = community_posts.group_id and m.user_id = (select auth.uid())
    ))
  );
create policy community_posts_update_own on public.community_posts for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy community_posts_delete_own on public.community_posts for delete to authenticated using ((select auth.uid()) = author_id);

create policy community_comments_read on public.community_comments for select to authenticated using (true);
create policy community_comments_create on public.community_comments for insert to authenticated with check ((select auth.uid()) = author_id);
create policy community_comments_update_own on public.community_comments for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy community_comments_delete_own on public.community_comments for delete to authenticated using ((select auth.uid()) = author_id);

create policy community_reactions_read on public.community_reactions for select to authenticated using (true);
create policy community_reactions_create on public.community_reactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy community_reactions_delete on public.community_reactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy community_reports_create on public.community_reports for insert to authenticated with check ((select auth.uid()) = reporter_id);

grant select, insert, delete on public.community_groups to authenticated;
grant select, insert, delete on public.community_group_members to authenticated;
grant select, insert, delete on public.community_posts to authenticated;
grant select, insert, delete on public.community_comments to authenticated;
grant select, insert, delete on public.community_reactions to authenticated;
grant insert on public.community_reports to authenticated;
revoke all on function private.community_name(uuid) from public, anon, authenticated;
revoke all on function private.set_community_group_identity() from public, anon, authenticated;
revoke all on function private.set_community_author() from public, anon, authenticated;
revoke all on function private.add_community_owner() from public, anon, authenticated;
revoke all on function private.update_community_member_count() from public, anon, authenticated;

do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['community_posts', 'community_comments', 'community_reactions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

commit;
