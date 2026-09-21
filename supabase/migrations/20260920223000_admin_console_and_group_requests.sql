begin;

-- Admin console foundations -------------------------------------------------
create schema if not exists private;
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists community_suspended_until timestamptz;

do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('student', 'admin'));
exception when duplicate_object then null;
end $$;

-- Keep the privileged profile lookup in the unexposed schema. The public RPC
-- remains security-invoker and reveals only one boolean about the caller.
create or replace function private.current_user_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
$$;
revoke all on function private.current_user_is_admin() from public, anon;
grant execute on function private.current_user_is_admin() to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.current_user_is_admin()
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (length(action) between 2 and 80),
  entity_type text not null check (length(entity_type) between 2 and 80),
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
alter table public.admin_audit_logs enable row level security;
drop policy if exists admin_audit_read on public.admin_audit_logs;
create policy admin_audit_read on public.admin_audit_logs for select to authenticated
  using ((select public.is_admin()));
drop policy if exists admin_audit_create on public.admin_audit_logs;
create policy admin_audit_create on public.admin_audit_logs for insert to authenticated
  with check ((select public.is_admin()) and actor_id = (select auth.uid()));
grant select, insert on public.admin_audit_logs to authenticated;

-- Telegram-style private group membership ---------------------------------
create table if not exists public.community_group_requests (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  primary key (group_id, user_id)
);
create index if not exists community_group_requests_owner_idx
  on public.community_group_requests(group_id, status, requested_at);

create or replace function private.set_group_request_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  new.user_id := auth.uid();
  new.requester_name := coalesce(private.community_name(auth.uid()), 'SAT Student');
  new.status := 'pending';
  new.decided_at := null;
  new.decided_by := null;
  return new;
end $$;

create or replace function private.decide_group_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.group_id <> old.group_id or new.user_id <> old.user_id
    or new.requester_name <> old.requester_name
    or new.requested_at <> old.requested_at then
    raise exception 'Request identity cannot be changed';
  end if;
  if new.status = old.status then
    raise exception 'Only the request decision can be changed';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected';
  end if;
  new.decided_at := now();
  new.decided_by := auth.uid();
  return new;
end $$;

create or replace function private.apply_group_request_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    insert into public.community_group_members(group_id, user_id, role)
    values (new.group_id, new.user_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;
  return new;
end $$;

create or replace function private.cleanup_group_request_after_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'member' then
    delete from public.community_group_requests
    where group_id = old.group_id and user_id = old.user_id;
  end if;
  return old;
end $$;

drop trigger if exists community_group_request_identity on public.community_group_requests;
create trigger community_group_request_identity before insert on public.community_group_requests
for each row execute function private.set_group_request_identity();
drop trigger if exists community_group_request_decision on public.community_group_requests;
create trigger community_group_request_decision before update on public.community_group_requests
for each row execute function private.decide_group_request();
drop trigger if exists community_group_request_apply on public.community_group_requests;
create trigger community_group_request_apply after update on public.community_group_requests
for each row when (old.status is distinct from new.status)
execute function private.apply_group_request_decision();
drop trigger if exists community_group_request_cleanup on public.community_group_members;
create trigger community_group_request_cleanup after delete on public.community_group_members
for each row execute function private.cleanup_group_request_after_leave();

alter table public.community_group_requests enable row level security;
create policy community_group_requests_read on public.community_group_requests for select to authenticated
  using (
    user_id = (select auth.uid()) or
    exists (select 1 from public.community_groups g where g.id = group_id and g.owner_id = (select auth.uid())) or
    (select public.is_admin())
  );
create policy community_group_requests_create on public.community_group_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy community_group_requests_cancel on public.community_group_requests for delete to authenticated
  using (user_id = (select auth.uid()) and status <> 'approved');
create policy community_group_requests_decide on public.community_group_requests for update to authenticated
  using (
    status = 'pending' and (
      exists (select 1 from public.community_groups g where g.id = group_id and g.owner_id = (select auth.uid())) or
      (select public.is_admin())
    )
  )
  with check (
    exists (select 1 from public.community_groups g where g.id = group_id and g.owner_id = (select auth.uid())) or
    (select public.is_admin())
  );
grant select, insert, update, delete on public.community_group_requests to authenticated;

drop policy if exists community_members_join on public.community_group_members;
drop policy if exists community_members_owner_add on public.community_group_members;
create policy community_members_owner_add on public.community_group_members for insert to authenticated
  with check (
    role = 'member' and (
      exists (select 1 from public.community_groups g where g.id = group_id and g.owner_id = (select auth.uid())) or
      (select public.is_admin())
    )
  );

-- Student vocabulary submissions ------------------------------------------
create table if not exists public.vocab_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null check (length(btrim(word)) between 2 and 80),
  definition text not null check (length(btrim(definition)) between 3 and 800),
  example_sentence text not null default '' check (length(example_sentence) <= 800),
  tags text[] not null default '{}',
  ai_assisted boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references auth.users(id) on delete set null,
  review_note text not null default '' check (length(review_note) <= 400),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists vocab_suggestions_status_idx on public.vocab_suggestions(status, created_at desc);
alter table public.vocab_suggestions enable row level security;
create policy vocab_suggestions_own_read on public.vocab_suggestions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy vocab_suggestions_own_create on public.vocab_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy vocab_suggestions_admin_update on public.vocab_suggestions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update on public.vocab_suggestions to authenticated;

-- Moderation state and missing practice-test catalog -----------------------
alter table public.community_reports add column if not exists status text not null default 'open';
alter table public.community_reports add column if not exists resolved_at timestamptz;
alter table public.community_reports add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.community_reports add column if not exists resolution_note text not null default '';

create table if not exists public.practice_test_catalog (
  id text primary key,
  title text not null,
  year text not null,
  filename text not null,
  size bigint not null default 0,
  answer_key boolean not null default false,
  storage_path text not null,
  manifest jsonb,
  published boolean not null default false
);
alter table public.practice_test_catalog enable row level security;
drop policy if exists catalog_read on public.practice_test_catalog;
create policy catalog_read on public.practice_test_catalog for select to authenticated using (published or (select public.is_admin()));
create policy catalog_admin_insert on public.practice_test_catalog for insert to authenticated with check ((select public.is_admin()));
create policy catalog_admin_update on public.practice_test_catalog for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy catalog_admin_delete on public.practice_test_catalog for delete to authenticated using ((select public.is_admin()));
grant select, insert, update, delete on public.practice_test_catalog to authenticated;

drop policy if exists practice_test_admin_upload on storage.objects;
create policy practice_test_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'practice-tests' and (select public.is_admin()));
drop policy if exists practice_test_admin_update on storage.objects;
create policy practice_test_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'practice-tests' and (select public.is_admin()))
  with check (bucket_id = 'practice-tests' and (select public.is_admin()));
drop policy if exists practice_test_admin_delete on storage.objects;
create policy practice_test_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'practice-tests' and (select public.is_admin()));

-- Admin-only policies. Every Server Action still performs its own admin check.
create policy profiles_admin_read on public.profiles for select to authenticated using ((select public.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update(role, community_suspended_until) on public.profiles to authenticated;

create policy questions_admin_insert on public.questions for insert to authenticated with check ((select public.is_admin()));
create policy questions_admin_update on public.questions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy questions_admin_delete on public.questions for delete to authenticated using ((select public.is_admin()));
grant insert, update, delete on public.questions to authenticated;

drop policy if exists vocab_admin_insert on public.vocab_words;
drop policy if exists vocab_admin_update on public.vocab_words;
drop policy if exists vocab_admin_delete on public.vocab_words;
create policy vocab_admin_insert on public.vocab_words for insert to authenticated with check ((select public.is_admin()));
create policy vocab_admin_update on public.vocab_words for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy vocab_admin_delete on public.vocab_words for delete to authenticated using ((select public.is_admin()));
grant insert, update, delete on public.vocab_words to authenticated;

create policy community_reports_admin_read on public.community_reports for select to authenticated using ((select public.is_admin()));
create policy community_reports_admin_update on public.community_reports for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy community_reports_admin_delete on public.community_reports for delete to authenticated using ((select public.is_admin()));
grant select, update, delete on public.community_reports to authenticated;

create policy community_groups_admin_delete on public.community_groups for delete to authenticated using ((select public.is_admin()));
create policy community_posts_admin_delete on public.community_posts for delete to authenticated using ((select public.is_admin()));
create policy community_comments_admin_delete on public.community_comments for delete to authenticated using ((select public.is_admin()));

-- Suspended members may read, but cannot create community content.
create or replace function private.enforce_community_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.community_suspended_until > now()
  ) then
    raise exception 'Community access is temporarily suspended';
  end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'community_groups', 'community_group_requests', 'community_posts',
    'community_comments', 'community_reactions', 'community_reports'
  ] loop
    execute format('drop trigger if exists community_access_guard on public.%I', table_name);
    execute format(
      'create trigger community_access_guard before insert on public.%I for each row execute function private.enforce_community_access()',
      table_name
    );
  end loop;
end $$;

revoke all on function private.set_group_request_identity() from public, anon, authenticated;
revoke all on function private.decide_group_request() from public, anon, authenticated;
revoke all on function private.apply_group_request_decision() from public, anon, authenticated;
revoke all on function private.cleanup_group_request_after_leave() from public, anon, authenticated;
revoke all on function private.enforce_community_access() from public, anon, authenticated;

commit;
