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

It is idempotent, and the app degrades gracefully if you haven't run it yet:
vocab falls back to saved-flags only, plan check-off just doesn't persist, and
the leaderboard shows a setup note. Your own XP/level/badges need no migration.

## Seeding content

Large source files (question banks, corpora, PDFs) are gitignored — regenerate
them locally:

```bash
python3 scripts/extract_questions.py    # PDFs  -> question-bank.json
python3 scripts/extract_vocab.py        # PDFs  -> vocab.json (1,915 words)
python3 scripts/seed_questions.py       # JSON  -> Supabase
python3 scripts/seed_vocab.py           # JSON  -> Supabase
```

Corpora are cached in-process, so **restart the dev server** after changing
`sat-corpus*.json`.

## AI (optional)

Everything works with no API key — the planner, tutor and lessons fall back to
retrieval over the book corpus. To use a real model, set in `.env.local`:

| Provider | `SAT_AI_BASE_URL` | `SAT_AI_MODEL` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Qwen (OpenRouter) | `https://openrouter.ai/api/v1` | `qwen/qwen3.8-flash` |

Any OpenAI-compatible `/chat/completions` endpoint works. Users can override the
model per-account in **Settings → AI model**.

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

# SAThack
# SAThack
