# SAThack Website Audit

Date: 2026-09-19

## Implementation update

The findings below are the original audit, preserved for context. This update supersedes their status.

### Completed

- Server-authoritative grading, deadline enforcement, randomized persistent test forms, transactional completion, and replay protection. Adaptive and diagnostic scores are explicitly practice estimates.
- Account-owned assessment saves and imported-test progress sync, visible retry states, safe exam exit, and a clock that continues during review and resume.
- Currency/math rendering fixes, readable graph backgrounds, scrollable passages, Check and Next question controls, full-domain sessions, mobile navigation, and dialog focus handling.
- Database aggregate summaries replace large question/attempt downloads. Shared progress calculations, unnecessary navigation prefetch removal, immediate sign-in redirect, and immediate landing content reduce avoidable work.
- Database grants/RLS/index cleanup, protected profile roles, quarantined empty question, AI quotas/model validation, production security headers, and route error boundaries.
- Password recovery, account export, password-confirmed deletion, sign-out, honest free-tier copy, removal of unsupported testimonials, Privacy/Terms pages, metadata, sitemap, and product screenshot.
- The old PDF/scan practice library has been removed. Ten native digital practice tests now use stable question-bank forms, timed modules, adaptive Module 2 routing, server grading, and account-based resume.

### Verified locally

- Production build without tracing warnings; TypeScript and ESLint pass.
- 8 Node tests and 10 Python tests pass. SQL regression tests cover forged grading, role escalation, deadline enforcement, resume, adaptive completion, diagnostic scoring, and replay protection.
- Chromium checks pass on public pages and 11 dashboard routes at desktop size, plus selected mobile routes at 390px with no horizontal overflow or browser errors.
- Browser checks verify adaptive answer persistence, review clock, reload/resume, module transition, imported images and answers, and source-dialog focus/Escape.
- A disposable account verified question Check/Save, persistent goals, export, sign-out, and account deletion. The account was removed and its absence checked in the database.
- Observed local route loads ranged roughly 50ms to 2.5s. These are local smoke-test timings, not production Core Web Vitals or a speed guarantee.

### Still required before calling the site finished

1. Restore GitHub and Vercel access. Git push has no HTTPS credentials; Vercel access returns 403 for the project scope. No new deployment is claimed.
2. Review the question-bank provenance, graph/table rendering, and answer keys against source material before public release. Do not label practice estimates as official College Board scaled scores.
3. Enable Supabase leaked-password protection; configure production recovery redirect URLs, site URL, AI credentials/model limits, and a production Desmos key if embedding is desired.
4. Have the site owner review Privacy/Terms, content redistribution rights, student-data handling, and any score/percentile claims before public launch.
5. Measure production Core Web Vitals, add error monitoring, and continue accessibility/content QA on real devices. The large shared stylesheet and additional payload splitting remain optimization opportunities.

See `DEPLOYMENT.md` for configuration and publishing steps. The original findings follow.

## Release status

- Local production build, TypeScript, ESLint, 7 Node tests, and 10 Python tests pass.
- Commit `0b14be4` contains the practice-session and digital question collection work.
- GitHub push is blocked because this machine has no GitHub HTTPS credential.
- Vercel deployment is blocked because the connected token cannot access the `sathack` project scope and the browser is waiting for GitHub sign-in.
- The current practice-test file design cannot work on Vercel: `Practise tests/` is excluded from both Git and Vercel while the application reads it from the local filesystem.

## P0: fix before public release

### 1. Grade every answer on the server

`recordAttempt`, `completeTestSession`, and `saveDiagnostic` accept `correct_answer`, `is_correct`, scores, totals, and domain data from the browser. A signed-in user can forge requests and inflate scores, accuracy, progress, and leaderboard data.

Accept only question IDs and selected answers. Fetch canonical questions on the server, calculate correctness and scores there, validate the request with a schema, and write the session and attempts in one database transaction.

### 2. Move practice-test assets to production storage

The test library reads PDFs and generated assets from `process.cwd()/Practise tests`, but that 1.1 GB directory is ignored. Vercel will therefore return an empty library or missing assets. The image route also produces a build warning because its dynamic file lookup causes tracing across 39,278 files.

Put PDFs and rendered images in Supabase Storage or another object store/CDN. Store test manifests and asset URLs in the database, import them with a one-off script, and serve signed or public URLs instead of local paths.

### 3. Make the exam clock authoritative

The timer stops whenever the student opens review mode and a resumed session receives a fresh full-module timer. Progress saves are fire-and-forget and failures are hidden.

Persist a server-issued module deadline, derive remaining time from that deadline in every view, enforce expiration server-side, and surface retryable save failures.

### 4. Repair database security

Supabase reports anonymous and authenticated execution on three `SECURITY DEFINER` functions: `bank_overview`, `is_admin`, and `leaderboard`. Revoke broad execute permission, grant it only to intended roles, set an explicit safe `search_path`, and verify every function's authorization behavior. Enable leaked-password protection in Auth.

## P1: high-impact correctness and product work

### 5. Generate real test forms

Adaptive tests deterministically select the same ordered question set; diagnostics always take the first 11 questions per section. Generate and persist a server-side test blueprint, balance domains and difficulty, exclude recently seen questions, and keep the same IDs on resume.

### 6. Describe scores accurately

The current score formula is a linear conversion from percent correct. That is not official Digital SAT adaptive scoring. Label results as a "practice estimate" and calibrate the model using validated test-form data before making stronger claims.

### 7. Finish the imported digital tests

Validate every extracted question, graph, table, choice, answer key, and explanation. Add import-review status and provenance. Sync progress to the account instead of only `localStorage`, and define scoring before calling a test complete.

### 8. Add AI Tutor limits and validation

Add per-user rate limits and quotas, cap and validate input, allowlist models on the server, record provider failures, and expose a useful retry state. This prevents cost abuse and silent empty responses.

### 9. Make pricing truthful and functional

Free, Pro, and Max are presented, but there is no billing or entitlement system and every CTA goes to auth. Either remove paid claims for launch or implement checkout, subscriptions, webhook reconciliation, feature gates, billing management, and cancellation.

### 10. Fix trust and legal gaps

Terms and Privacy links point to `#`. Testimonials and score-jump claims are hardcoded without visible provenance. Publish real legal pages suitable for student/minor data and AI providers, add account export/deletion, and use verified testimonials or clearly labeled examples.

### 11. Add production security headers

Configure CSP, `frame-ancestors`, `X-Content-Type-Options`, Referrer Policy, and Permissions Policy. Disable `X-Powered-By`. Review the CSP carefully for Supabase, Desmos, fonts, and any AI endpoints.

### 12. Replace the Desmos demo key

The shared fallback key is explicitly rate-limited and not intended for production. Register the production domain and set `NEXT_PUBLIC_DESMOS_API_KEY` in Vercel.

## P2: quality, speed, and accessibility

### 13. Reduce database work

Question Bank and dashboard views fetch large sets of question and attempt rows to calculate summaries. Move aggregates to well-indexed SQL/RPCs, paginate lists, and fetch only the fields shown.

Add indexes for `plan_tasks(plan_id)`, `saved_questions(question_id)`, `study_plans(diagnostic_id)`, and `vocab_progress(word_id)`. Replace repeated `auth.uid()` policy calls with the recommended init-plan form. Consolidate overlapping permissive policies and remove duplicate indexes.

### 14. Add error and observability foundations

Create route-level and global error boundaries, a custom not-found page, structured server logs, and production error monitoring. Stop discarding Supabase write errors and attach a request/session ID to failures.

### 15. Improve authentication recovery

Add forgot-password/reset-password flows and optional OAuth. Move the password visibility button outside the `<label>` so the field's accessible name is only "Password".

### 16. Finish dialog and mobile accessibility

Trap and restore focus in the calculator, reference sheet, tutor, and test dialogs. Support Escape consistently. Increase small mobile controls and footer links to at least 44 by 44 CSS pixels. The existing reduced-motion support is good and should be retained.

### 17. Tighten the public site

Fix ordinal suffixes (`1st`, `2nd`, `3rd`, not always `th`). Add `robots.txt`, `sitemap.xml`, canonical metadata, Open Graph/Twitter metadata, and real social preview artwork. The landing page currently has no product screenshot or other meaningful image.

### 18. Split and measure frontend payloads

`globals.css` is about 115 KB and 5,600 lines. Split styles by surface or migrate repeated primitives into scoped components. Map the largest JavaScript chunks to routes, keep expensive dashboard tools lazy, and measure Core Web Vitals on the deployed build before optimizing further.

### 19. Clean the question corpus

The database contains 3,767 official questions and one record with empty `question_text`: `c334afed-6bd2-4304-92fc-eeb38cd8ecd2` (source `43926bd9`). Repair or quarantine it, then add import validation that rejects missing stems, choices, answer keys, or referenced media.

## Verified behavior

- Production build succeeds and all automated tests currently pass.
- Dashboard routes redirect unauthenticated users to sign-in.
- Landing and auth pages have no horizontal overflow at 1440x900 or 390x844.
- Auth inputs have labels and appropriate autocomplete attributes.
- No broken landing-page images were found; the page currently contains no image elements.
- The application includes reduced-motion handling.

## Recommended implementation order

1. Server-side grading and transactional session completion.
2. Object storage and database-backed practice-test manifests.
3. Deadline-based timing, durable resume, and save error handling.
4. Supabase function permissions, RLS/index cleanup, and security headers.
5. Test-form generation, validated scoring language, and corpus QA.
6. Auth recovery, legal/account controls, AI limits, accessibility, and SEO.
7. Billing only when plans and entitlements are ready end to end.
