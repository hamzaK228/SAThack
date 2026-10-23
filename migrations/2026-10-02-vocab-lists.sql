-- ============================================================================
-- Vocab — user-created word lists ("folders")
--   1. vocab_lists      — one row per list a student creates
--   2. vocab_list_items — membership; a word can live in several lists
-- Lists are private to their owner: plain RLS + explicit grants, no service
-- role. Spaced-repetition progress stays on vocab_progress and is shared
-- across lists (a word has one schedule, not one per list).
-- ============================================================================
begin;

create table if not exists public.vocab_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint vocab_lists_name_len check (length(btrim(name)) between 1 and 60)
);

-- Two lists differing only by case/spacing ("Week 1" / "week 1 ") would only
-- confuse the add-to-list picker, so names are unique per user.
create unique index if not exists vocab_lists_user_name_key
  on public.vocab_lists (user_id, lower(btrim(name)));

create table if not exists public.vocab_list_items (
  list_id uuid not null references public.vocab_lists (id) on delete cascade,
  word_id uuid not null references public.vocab_words (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, word_id)
);

create index if not exists vocab_list_items_word_idx
  on public.vocab_list_items (word_id);

alter table public.vocab_lists enable row level security;
alter table public.vocab_list_items enable row level security;

drop policy if exists vocab_lists_owner on public.vocab_lists;
create policy vocab_lists_owner on public.vocab_lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Items carry no user_id of their own; the policy reaches through the parent
-- list, so a membership row can only ever be read/written by the list's owner.
drop policy if exists vocab_list_items_owner on public.vocab_list_items;
create policy vocab_list_items_owner on public.vocab_list_items
  for all to authenticated
  using (
    exists (
      select 1 from public.vocab_lists l
      where l.id = list_id and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.vocab_lists l
      where l.id = list_id and l.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.vocab_lists to authenticated;
grant select, insert, update, delete on public.vocab_list_items to authenticated;
revoke all on public.vocab_lists from anon;
revoke all on public.vocab_list_items from anon;

commit;
