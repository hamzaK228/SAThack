-- ============================================================================
-- Vocab — personal words + list preview customization
--
-- A student can now add words that are not in the curated bank. Those rows
-- live in vocab_words with owner_id set; the general bank keeps owner_id null.
-- RLS shows the general bank plus the caller's own words, and only the caller
-- can edit/delete their rows. Lists become customizable preview cards
-- (description, emoji, accent colour).
-- ============================================================================
begin;

alter table public.vocab_words
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

create index if not exists vocab_words_owner_idx
  on public.vocab_words (owner_id);

-- The original global UNIQUE(word) prevented two students from adding the same
-- personal word. Keep exact uniqueness for the curated bank, and scope personal
-- uniqueness to (owner, lower(word)).
alter table public.vocab_words drop constraint if exists vocab_words_word_key;

create unique index if not exists vocab_words_general_word_key
  on public.vocab_words (lower(word)) where owner_id is null;

create unique index if not exists vocab_words_owner_word_key
  on public.vocab_words (owner_id, lower(word)) where owner_id is not null;

-- Add the preview fields. Existing lists get a usable default card.
alter table public.vocab_lists
  add column if not exists description text not null default '',
  add column if not exists emoji text not null default '📁',
  add column if not exists color text not null default 'lime';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vocab_lists_description_len') then
    alter table public.vocab_lists
      add constraint vocab_lists_description_len check (char_length(description) <= 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vocab_lists_emoji_len') then
    alter table public.vocab_lists
      add constraint vocab_lists_emoji_len check (char_length(emoji) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vocab_lists_color_allowed') then
    alter table public.vocab_lists
      add constraint vocab_lists_color_allowed check (color in ('lime', 'sky', 'rose', 'amber', 'violet', 'teal'));
  end if;
end $$;

-- The general bank is readable by every signed-in student; personal rows only by
-- their owner (admins keep the existing content-management visibility).
drop policy if exists vocab_read on public.vocab_words;
create policy vocab_read on public.vocab_words
  for select to authenticated
  using (
    owner_id is null
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists vocab_words_owner_insert on public.vocab_words;
create policy vocab_words_owner_insert on public.vocab_words
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists vocab_words_owner_update on public.vocab_words;
create policy vocab_words_owner_update on public.vocab_words
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists vocab_words_owner_delete on public.vocab_words;
create policy vocab_words_owner_delete on public.vocab_words
  for delete to authenticated
  using (owner_id = (select auth.uid()));

commit;
