# Release checklist

## Configuration

Use server environment settings or an ignored `.env.local`; never commit credentials.

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: application's Supabase project.
- `NEXT_PUBLIC_SITE_URL`: canonical production origin. Vercel production URL is a fallback.
- `NEXT_PUBLIC_DESMOS_API_KEY`: optional registered key; without it, the calculator offers an external link.
- `NEXT_PUBLIC_OAUTH_PROVIDERS`: comma-separated social providers whose buttons go live on `/auth` (e.g. `google,github`). Only list a provider once Supabase → Authentication → Providers holds a real client id + secret and `https://arpwvfphzryaaxrvegju.supabase.co/auth/v1/callback` is registered in that provider's console — a provider that is merely enabled in Supabase still carries placeholder credentials and would dead-end. Unlisted providers render dimmed; names the UI does not offer (Apple and Facebook were removed) are ignored. `NEXT_PUBLIC_*` values are inlined at build time, so a change needs a redeploy.
- `SAT_AI_API_KEY`, `SAT_AI_MODEL`, `SAT_AI_ALLOWED_MODELS`: optional configured AI provider access and comma-separated permitted models. Without a provider key the existing book-retrieval fallback remains available.

In Supabase Auth, configure the production site URL and allow `/auth/callback` recovery/signup redirects. Enable leaked-password protection. Database migrations in `migrations/` were applied to project `arpwvfphzryaaxrvegju`; apply them in dependency order to any new environment: assessment-hardening, platform-hardening, account-deletion, progress-summary, vocab-policy-cleanup, native-practice-forms.

The ten native practice forms are stored in `practice_forms` and reference the verified question bank. No local PDF directory or object-storage upload is required. The form migration creates stable, non-overlapping question pools and both easier and harder Module 2 routes.

## Verify and deploy

```sh
pnpm lint
node --test scripts/test_math_text.mjs scripts/test_question_collections.mjs
python3 -m unittest discover -s scripts -p 'test_*.py'
pnpm build
```

Run `scripts/test_assessments.sql` against a test database; it rolls back its fixtures. Run `scripts/verify-website.mjs` against a production-mode local server with a disposable `QA_EMAIL` and `QA_PASSWORD`. `scripts/verify-account.mjs` additionally requires `QA_DISPOSABLE=true` and permanently deletes that test account. Both accept `TEST_URL` and an optional `PLAYWRIGHT_MODULE` path.

After GitHub and Vercel credentials are restored, push the reviewed commit, verify the linked production deployment, and repeat the browser flows on the production URL. Configure monitoring and measure performance there before making speed claims.

## Feature pack (October 2026)

Apply `supabase/migrations/20261023120000_feature_pack.sql` after the existing
migrations. It adds:

- `attempt_notes` — one private "why I missed it" reason per student/question.
- `question_reports` — student content flags with an admin triage page.
- `share_tokens` + `shared_progress()` — expiring, revocable read-only progress
  links at `/share/<token>`.
- `profiles.digest_opt_in` / `digest_last_sent_at` + `digest_recipients()` —
  the opt-in weekly email digest.
- `admin_question_calibration()` — p-value outliers for the admin calibration
  page.
- A profile-role guard: `role` and `community_suspended_until` are no longer
  directly updatable by `authenticated`; `admin_set_user_access()` is the only
  write path and re-checks `is_admin()` in the database.

The application also adds:

- A 15/25/40/60-minute session builder on `/dashboard/session?minutes=N`.
- Mastery sessions (`?mastery=1`) that keep a question until three consecutive
  correct attempts.
- A conservative test-day score projection on analytics.
- A shareable result card at `/api/share/<handle>` (PNG, 1200×630).
- Duel rematch rooms and a copyable invite link.
- `vercel.json` with a Sunday 16:00 UTC cron for the digest.

### Required environment for the digest

The digest route returns 503 until these are set (in Vercel and locally):

- `CRON_SECRET` — Vercel Cron sends it as `Authorization: Bearer …`.
- `SUPABASE_SERVICE_ROLE_KEY` — the route needs it to read opted-in emails.
- One delivery path: `RESEND_API_KEY` (plus optional `DIGEST_FROM`) **or**
  `DIGEST_WEBHOOK_URL` (a JSON `{to, subject, html}` POST).

Without a delivery path the route counts recipients and skips sending rather
than failing. Turn the digest on per student in **Settings → Weekly digest**.

### Security hardening (same release)

Apply `supabase/migrations/20261023130000_security_hardening.sql` and
`supabase/migrations/20261023140000_xp_and_reveal_cap.sql` **with the matching
application deploy**, not before it. They close the audit's P0 answer-key read:

- `questions.correct_answer` / `explanation` are no longer selectable by
  `authenticated`; the table exposes only safe columns.
- `record_attempt()` validates and rate-limits attempts; direct `INSERT`/`DELETE`
  on `practice_attempts` is revoked.
- `check_answer()` returns a boolean only when the student already has a wrong
  attempt; `reveal_answer()` returns the key/explanation only after a real
  attempt.
- Admin reads go through `admin_question()` / `admin_question_keys()`, which
  re-check `is_admin()` in the database.
- Guest duel is limited to a fixed 48-question demo pool (`guest_demo`), so the
  anonymous check cannot enumerate the bank.
- Explanations have a 250-per-UTC-day budget per student; the same question
  counts once. Admins are exempt.

The teaching rule is unchanged: a question's explanation unlocks after the
student attempts it. Keys are no longer readable before an attempt, and they are
never exposed as a table column to ordinary clients.

### Other audit items fixed in this batch

- Plan “Not today” and accepted difficulty adjustments now write the required
  `plan_tasks` metadata; the agent only proposes practice tasks with a
  difficulty it can actually change.
- AI calls are capped at 20 seconds, plan narratives refresh in buckets instead
  of on every attempt, and plan/adjustment calls consume the daily quota.
- Analytics paginates the full attempt history.
- The right rail no longer refreshes the whole route after every drill answer.
- The admin editor preserves bare tables, SVGs and images.
- `seed_questions.py` upserts by `source_id` instead of deleting the bank.
- Leaderboard XP counts each question once; labels say “Active days”.

### Still open

- The leaderboard RPC remains a global scan (now indexed); it needs a
  materialized per-user stats table before it is cheap at much larger scale.
- Share links/cards still compute their XP through `leaderboard(1000)`; the card
  is cached, but a materialized stats table would remove the scan.
- Legacy `ah_*` / `ielts_*` tables and functions still share the database.
- Authenticated browser flows have not been exercised end-to-end (no QA
  credentials); DB RLS/RPC paths and public routes are tested.
- The digest is still disabled until the env vars above are set.
- The guest static fallback IDs predate the current bank; the live RPC demo pool
  is the source of truth.
