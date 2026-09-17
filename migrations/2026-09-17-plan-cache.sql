-- ============================================================================
--  SAThack — study-plan narrative cache (2026-09-17)
--
--  The AI narrative (summary / strengths / weaknesses / insights / tips) used
--  to be regenerated on every dashboard render, which put seconds of model
--  latency in the critical path of every navigation and of every goal save.
--  It is now cached here, keyed by `signature` — a fingerprint of the results
--  it was written for (see src/lib/study-plan-data.ts).
--
--  The schedule (weeks, days left, tasks, priority order) is recomputed from
--  the live goals on every render, so changing the test date never needs the
--  model. A signature mismatch (new practice data, new target) regenerates it.
--
--  Idempotent: safe to run twice. Without it the app still works — the plan is
--  simply rebuilt on every render, as before.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The cache
-- ---------------------------------------------------------------------------
alter table public.study_plans
  add column if not exists signature text,
  add column if not exists plan jsonb;

comment on column public.study_plans.signature is
  'Fingerprint of the results the cached narrative was written for; a mismatch means it must be regenerated.';

comment on column public.study_plans.plan is
  'Cached AI narrative: { summary, strengths[], weaknesses[], insights[], tips[], source }.';

-- ---------------------------------------------------------------------------
-- 2. Reconcile installs that predate migrations/2026-09-15-polish.sql
-- ---------------------------------------------------------------------------
-- Those installs already had a `study_plans` table, so that file's
-- `create table if not exists` was a no-op and the app has been writing to
-- columns that were never created (the write failed silently). Add what's
-- missing — these are all no-ops on a database created by that migration.
alter table public.study_plans
  add column if not exists target_score int,
  add column if not exists current_score int,
  add column if not exists test_date date,
  add column if not exists weeks int,
  add column if not exists summary text,
  add column if not exists generated_at timestamptz not null default now();

-- The legacy shape declares plan_json as NOT NULL with no default, which would
-- reject the app's inserts. Give it a default; nothing reads it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'study_plans'
      and column_name = 'plan_json'
  ) then
    alter table public.study_plans alter column plan_json set default '{}'::jsonb;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. One plan per user — the key the app upserts on
-- ---------------------------------------------------------------------------
do $$
begin
  -- Keep the newest row per user before the key goes on.
  delete from public.study_plans a
    using public.study_plans b
    where a.user_id = b.user_id
      and a.id <> b.id
      and a.created_at <= b.created_at;

  begin
    alter table public.study_plans
      add constraint study_plans_user_id_key unique (user_id);
  exception
    when duplicate_table or duplicate_object then null;
  end;
end $$;
