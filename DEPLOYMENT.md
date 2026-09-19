# Release checklist

## Configuration

Use server environment settings or an ignored `.env.local`; never commit credentials.

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: application's Supabase project.
- `NEXT_PUBLIC_SITE_URL`: canonical production origin. Vercel production URL is a fallback.
- `NEXT_PUBLIC_DESMOS_API_KEY`: optional registered key; without it, the calculator offers an external link.
- `SAT_AI_API_KEY`, `SAT_AI_MODEL`, `SAT_AI_ALLOWED_MODELS`: optional configured AI provider access and comma-separated permitted models. Without a provider key the existing book-retrieval fallback remains available.
- `PRACTICE_TESTS_ROOT`: local development corpus directory only. Production assets must use storage.

In Supabase Auth, configure the production site URL and allow `/auth/callback` recovery/signup redirects. Enable leaked-password protection. Database migrations in `migrations/` were applied to project `arpwvfphzryaaxrvegju`; apply them in dependency order to any new environment: assessment-hardening, platform-hardening, account-deletion, progress-summary, vocab-policy-cleanup.

## Publish local test assets

Review the source material and redistribution rights first. Manifests with extraction issues still need editorial review; publishing does not certify OCR or answers.

Run from the repository with the Supabase URL and a **server-only** `SUPABASE_SERVICE_ROLE_KEY` available in the shell:

```sh
node scripts/publish-practice-tests.mjs --dry-run
node scripts/publish-practice-tests.mjs
```

The script validates local assets, uploads to the private `practice-tests` bucket, and publishes each catalog entry only after its uploads succeed. It can be rerun after failure. Never expose the service-role key as a `NEXT_PUBLIC_` variable. Current local corpus: 36 PDFs, approximately 1,065 MiB including generated assets.

## Verify and deploy

```sh
pnpm lint
node --test scripts/test_math_text.mjs scripts/test_question_collections.mjs
python3 -m unittest discover -s scripts -p 'test_*.py'
pnpm build
```

Run `scripts/test_assessments.sql` against a test database; it rolls back its fixtures. Run `scripts/verify-website.mjs` against a production-mode local server with a disposable `QA_EMAIL` and `QA_PASSWORD`. `scripts/verify-account.mjs` additionally requires `QA_DISPOSABLE=true` and permanently deletes that test account. Both accept `TEST_URL` and an optional `PLAYWRIGHT_MODULE` path.

After GitHub and Vercel credentials are restored, push the reviewed commit, verify the linked production deployment, and repeat the browser flows on the production URL. Configure monitoring and measure performance there before making speed claims.
