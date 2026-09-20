begin;
drop policy if exists "vocab_words read" on public.vocab_words;
drop policy if exists "vocab_words write" on public.vocab_words;
create policy vocab_read on public.vocab_words for select to authenticated using(true);
create policy vocab_admin_insert on public.vocab_words for insert to authenticated with check((select public.is_admin()));
create policy vocab_admin_update on public.vocab_words for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy vocab_admin_delete on public.vocab_words for delete to authenticated using((select public.is_admin()));
commit;
