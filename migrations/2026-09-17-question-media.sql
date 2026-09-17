-- ============================================================================
--  SAThack — question media (2026-09-17)
--
--  ~15% of the College Board questions carry an embedded graphic: a matplotlib
--  <svg> graph or a <table> of data, sitting inside the question's stem/stimulus
--  HTML. The extractor collapsed every field to plain text, so all of it was
--  lost — an <svg> became nothing but its aria-label, and a table became loose
--  cell values. The app showed a description of a graph instead of the graph.
--
--  These columns hold a sanitized copy of that markup (see
--  scripts/rich_html.py, which allowlists tags/attributes at extraction time).
--  They are NULL for the ~85% of questions whose plain-text columns already
--  carry everything, so those queries stay as lean as they are today.
--
--  Idempotent, and the app degrades gracefully without it: it just keeps
--  rendering the plain-text columns as before.
-- ============================================================================

alter table public.questions
  add column if not exists question_text_html text,
  add column if not exists passage_html text;

comment on column public.questions.question_text_html is
  'Sanitized rich HTML for the question stem (graphs/tables preserved), NULL when plain text says it all.';

comment on column public.questions.passage_html is
  'Sanitized rich HTML for the stimulus/passage (figures/tables preserved), NULL when plain text says it all.';

-- The bank filters on (is_official) and pages through it, so make the "only
-- rows that actually have rich media" lookup cheap for the backfill tooling.
create index if not exists questions_has_media_idx
  on public.questions (id)
  where question_text_html is not null or passage_html is not null;
