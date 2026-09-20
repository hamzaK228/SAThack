begin;

-- Question and vocabulary content is curated server-side. Authenticated users
-- may read it, but direct Data API calls must never be able to alter it.
revoke insert, update, delete on public.questions from anon, authenticated;
revoke insert, update, delete on public.vocab_words from anon, authenticated;

-- Community limits live in the database so bypassing the UI does not bypass
-- abuse protection. Identity triggers run first and overwrite author fields.
create or replace function private.enforce_community_group_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.owner_id <> auth.uid() then
    raise exception 'Authentication required';
  end if;
  if (select count(*) from public.community_groups
      where owner_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Group creation limit reached';
  end if;
  return new;
end $$;

create or replace function private.enforce_community_post_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.author_id <> auth.uid() then
    raise exception 'Authentication required';
  end if;
  if (select count(*) from public.community_posts
      where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 8 then
    raise exception 'Post limit reached';
  end if;
  return new;
end $$;

create or replace function private.enforce_community_comment_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.author_id <> auth.uid() then
    raise exception 'Authentication required';
  end if;
  if (select count(*) from public.community_comments
      where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Reply limit reached';
  end if;
  return new;
end $$;

create or replace function private.enforce_community_report_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.reporter_id <> auth.uid() then
    raise exception 'Authentication required';
  end if;
  if (select count(*) from public.community_reports
      where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Report limit reached';
  end if;
  return new;
end $$;

create trigger community_group_rate before insert on public.community_groups
for each row execute function private.enforce_community_group_rate();
create trigger community_post_rate before insert on public.community_posts
for each row execute function private.enforce_community_post_rate();
create trigger community_comment_rate before insert on public.community_comments
for each row execute function private.enforce_community_comment_rate();
create trigger community_report_rate before insert on public.community_reports
for each row execute function private.enforce_community_report_rate();

revoke all on function private.enforce_community_group_rate() from public, anon, authenticated;
revoke all on function private.enforce_community_post_rate() from public, anon, authenticated;
revoke all on function private.enforce_community_comment_rate() from public, anon, authenticated;
revoke all on function private.enforce_community_report_rate() from public, anon, authenticated;

commit;
