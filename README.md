# SAThack

Digital SAT prep: 3,767 real College Board questions across the 8 SAT domains, a
spaced-repetition vocabulary trainer, full-length adaptive mocks with the Desmos
calculator, and an AI study planner/tutor grounded in the SAT books.

Built with Next.js (App Router) + Supabase.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## First-run database setup

Run the migration once in the Supabase SQL editor (Dashboard → SQL Editor), or:

```bash
supabase db push
```

- `migrations/2026-09-15-polish.sql` — spaced repetition on `vocab_progress`,
  `study_plans` + `plan_tasks` (plan check-off), the `leaderboard()` RPC, vocab
  example cleanup, and dropping the unused `lessons` table.
- `migrations/2026-09-17-plan-cache.sql` — the `study_plans` columns that cache
  the AI narrative between renders (plus a one-per-user key for the upsert).
  Without it the plan is rebuilt from scratch on every render.
- `migrations/2026-09-17-plan-tasks.sql` — reconciles `plan_tasks` (task keys +
  the `done` flag + the `user_id`/`task_key` key its check-off upsert needs).
  Without it ticking a task off never persists.
- `migrations/2026-09-17-question-media.sql` — the `question_text_html` /
  `passage_html` columns that carry each question's graph or table. Without it
  questions render as plain text (no graphs, no table structure).

It is idempotent, and the app degrades gracefully if you haven't run it yet:
vocab falls back to saved-flags only, plan check-off just doesn't persist, the
leaderboard shows a setup note, and the study plan is regenerated per render.
Your own XP/level/badges need no migration.

## Seeding content

Large source files (the question-bank JSON/SQL seeds and the source PDFs) are
gitignored — regenerate them locally:

```bash
python3 scripts/extract_questions.py    # PDFs  -> question-bank.json
python3 scripts/extract_vocab.py        # PDFs  -> vocab.json (1,915 words)
python3 scripts/seed_questions.py       # JSON  -> Supabase
python3 scripts/seed_vocab.py           # JSON  -> Supabase
```

Corpora are cached in-process, so **restart the dev server** after changing
`sat-corpus*.json`.

### Question graphics and tables

~1 in 6 questions carries media the plain text can't express: a matplotlib
`<svg>` graph (usually in the stem — "the graph of *f* is shown…") or a `<table>`
of data. The extractor keeps a **sanitized** copy of that markup
(`scripts/rich_html.py`: tag/attribute allowlists, no `on*` handlers, no
`javascript:`, inline styles only inside `<svg>`), and `QuestionText` renders it —
falling back to the plain-text columns for the other 85%, so nothing else
changes.

An existing database needs a one-off backfill (it only writes the two media
columns, keyed by `source_id`, so attempts and saved questions stay linked):

```bash
python3 scripts/backfill_question_media.py --fetch   # ~5 min, resumable
python3 scripts/backfill_question_media.py --push    # needs the temp rpc below
```

`--push` uses a narrow temporary loader; create it, run the push, then drop it:

```bash
python3 scripts/backfill_question_media.py --print-rpc-sql   # run this in Supabase
python3 scripts/backfill_question_media.py --push
python3 scripts/backfill_question_media.py --print-drop-sql  # and this afterwards
```

Prefer the SQL editor? `--sql-out media-seed.sql` emits the equivalent SQL
instead. A full re-extraction (`extract_questions.py` + `seed_questions.py`)
now writes these columns too, so a fresh install needs none of this.

## AI (optional)

Everything works with no API key — the planner, tutor and lessons fall back to
retrieval over the book corpus. To use a real model, set in `.env.local`:

| Provider | `SAT_AI_BASE_URL` | `SAT_AI_MODEL` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Qwen (OpenRouter) | `https://openrouter.ai/api/v1` | `qwen/qwen3.8-flash` |

Any OpenAI-compatible `/chat/completions` endpoint works. Users can override the
model per-account in **Settings → AI model**.

`SAT_AI_TIMEOUT_MS` (default `20000`) caps a single model call. The planner and
the tutor run inside a page render, so a stalled provider falls back to the
offline book corpus instead of hanging the page. The generated plan narrative is
cached per user (keyed by their results), so navigating — or editing a goal like
the test date — reuses it instead of paying for a new call.

Qwen3.8 Flash (Alibaba, Aug 2026) is a multimodal reasoning model with a 1M-token
context at $0.15/M in · $0.47/M out — roughly 8× the context window and cheaper
output than `gpt-4o-mini`, and built for agentic/multi-step work.

## Desmos

The practice-test toolbar loads Desmos with its shared demo key, which is
rate-limited and not for production traffic. Set
`NEXT_PUBLIC_DESMOS_API_KEY` to a production key from
[desmos.com/api](https://www.desmos.com/api) before launch.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
