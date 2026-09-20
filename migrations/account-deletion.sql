begin;
create or replace function private.delete_my_account() returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or not exists(select 1 from auth.sessions where user_id=uid and id::text=auth.jwt()->>'session_id') then raise exception 'Please sign in again'; end if;
 if to_timestamp((auth.jwt()->>'iat')::bigint)<now()-interval '10 minutes' then raise exception 'Please sign in again before deleting your account'; end if;
 delete from auth.sessions where user_id=uid;
 delete from auth.users where id=uid;
end $$;
create or replace function public.delete_my_account() returns void language sql security invoker set search_path='' as $$ select private.delete_my_account() $$;
revoke all on function private.delete_my_account(),public.delete_my_account() from public,anon;
grant execute on function private.delete_my_account(),public.delete_my_account() to authenticated;
commit;
