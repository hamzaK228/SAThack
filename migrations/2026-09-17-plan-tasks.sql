-- ============================================================================
--  SAThack — plan task check-off, reconciled (2026-09-17)
--
--  Same story as migrations/2026-09-17-plan-cache.sql: an install that predates
--  migrations/2026-09-15-polish.sql already had a `plan_tasks` table, so that
--  file's `create table if not exists` was a no-op. The app's check-off upsert
--  (task_key / kind / done / completed_at, unique on user_id + task_key) has
--  been failing silently ever since — ticking a plan task off never persisted,
--  and `getStudyPlan` never saw any progress.
--
--  Additive and idempotent: existing rows are kept and backfilled. On a
--  database created by the 2026-09-15 migration every statement is a no-op.
-- ============================================================================

alter table public.plan_tasks
  add column if not exists task_key text,
  add column if not exists kind text,
  add column if not exists done boolean not null default false,
  add column if not exists completed_at timestamptz;

-- The app writes tasks without a plan_id: the plan itself is derived from the
-- goals and results on every render, so a task isn't owned by a stored row.
alter table public.plan_tasks alter column plan_id drop not null;

-- Give pre-existing rows a stable key so they can sit under the unique key
-- below. They predate task keys, so they can never collide with a generated
-- task — the app simply won't look them up.
update public.plan_tasks
  set task_key = 'legacy-' || id
  where task_key is null;

-- Keep the legacy `status` column and the app's `done` flag agreeing.
update public.plan_tasks
  set done = true
  where done = false and status::text = 'completed';

-- The key the app upserts on.
do $$
begin
  begin
    alter table public.plan_tasks
      add constraint plan_tasks_user_id_task_key_key unique (user_id, task_key);
  exception
    when duplicate_table or duplicate_object then null;
  end;
end $$;

create index if not exists plan_tasks_user_idx on public.plan_tasks (user_id, week);
