begin;

do $$
begin
  if to_regprocedure('private.current_user_is_admin()') is null then
    raise exception 'Missing admin foundation. Apply 20260920223000_admin_console_and_group_requests.sql first.';
  end if;
end $$;

-- The public is_admin() wrapper executes as the signed-in user and calls the
-- tightly scoped helper in the private schema. EXECUTE on the function is not
-- sufficient without USAGE on its containing schema.
grant usage on schema private to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

-- Recreate these policies so databases that partially applied the first admin
-- migration converge on the same authorization rules.
alter table public.questions enable row level security;
drop policy if exists questions_admin_insert on public.questions;
drop policy if exists questions_admin_update on public.questions;
drop policy if exists questions_admin_delete on public.questions;
create policy questions_admin_insert on public.questions
  for insert to authenticated
  with check ((select public.is_admin()));
create policy questions_admin_update on public.questions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy questions_admin_delete on public.questions
  for delete to authenticated
  using ((select public.is_admin()));
grant select, insert, update, delete on public.questions to authenticated;

-- Migration marker used by the admin UI. Keeping it authorization-aware means
-- it reveals no setup details to anonymous callers.
create or replace function public.admin_content_setup_ready()
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.is_admin()
$$;
revoke all on function public.admin_content_setup_ready() from public, anon;
grant execute on function public.admin_content_setup_ready() to authenticated;

-- Publicly readable learning-content images. Writes remain admin-only. The
-- bucket deliberately excludes SVG because uploaded SVG may contain active
-- content; inline SVG imported by the trusted question-bank sanitizer is a
-- separate, already-sanitized path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-media',
  'question-media',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists question_media_admin_insert on storage.objects;
drop policy if exists question_media_admin_update on storage.objects;
drop policy if exists question_media_admin_delete on storage.objects;
create policy question_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-media'
    and (select public.is_admin())
  );
create policy question_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'question-media' and (select public.is_admin()))
  with check (bucket_id = 'question-media' and (select public.is_admin()));
create policy question_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-media' and (select public.is_admin()));

commit;
