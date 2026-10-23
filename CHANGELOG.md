# What's new

Plain-language list of user-facing changes, newest first. Each entry says how to see it.
Deeper technical notes live in `DEPLOYMENT.md` and in the code comments.

## 2026-10-23

### Practice and review
- **Error log.** Every missed question in the review queue can be tagged Content gap / Process slip / Misread / Time pressure; analytics shows the pattern. *See:* `/dashboard/review` → any question → "Why?".
- **Explain this miss.** After a wrong answer, "Show explanation" unlocks the official explanation without leaving the question; it only unlocks after an attempt. *See:* any drill.
- **Mastery set.** A review-queue button starts a set where each question stays until you answer it correctly three times in a row. *See:* `/dashboard/review` → "Mastery set · 3 in a row".
- **Short sessions.** A 15/25/40/60-minute set follows the next undone plan steps and fits the time you have. *See:* `/dashboard/session` → "Short on time?".

### Plan and analytics
- **Test-day projection.** A conservative straight-line projection from your last scored tests, with a confidence label. *See:* `/dashboard/analytics`.
- **Question reports.** Any drill question has a "Report a problem" control; admins triage reports at `/admin/reports`.
- **“Not today” actually works.** Snoozing a fresh step now stores the required week/title fields instead of silently failing. *See:* the today card → "Not today".
- **Analytics past 1,000 attempts.** The page paginates the full history; it no longer freezes at the first 1,000 answers.
- **XP counts a question once.** The leaderboard, badges and right-rail XP use the latest result per question, matching accuracy and question counts. Rows now say "Active days" instead of the misleading "Streak".
- **No mid-drill refresh.** The right rail no longer re-renders the whole session after every answer; it updates on the next navigation.
- **Faster, budgeted coaching.** Plan narratives refresh in buckets, use at most a 20-second model call, and consume the same daily AI budget as the tutor.

### Sharing and community
- **Parent/mentor link.** Create an expiring, revocable read-only progress link in Settings; it shows stats and recent tests, never answers or email. *See:* `/dashboard/settings` → "Share progress"; the public page is `/share/<token>`.
- **Shareable result card.** A 1200×630 PNG of level, XP and practice stats from any profile. *See:* `/dashboard/u/<handle>` → "Share card".
- **Duel rematch.** After a match, "Rematch · new room" creates a private room with the same settings; the waiting screen copies an invite link.
- **Weekly digest.** Opt-in email summary of the week, sent by a Sunday cron once the mail provider env is set. *See:* `/dashboard/settings` → "Weekly digest".

### Admin and safety
- **Difficulty calibration.** Questions with 10+ attempts whose observed accuracy is far from their label are listed with a suggested label. *See:* `/admin/calibration`.
- **Role guard.** `profiles.role` and suspensions are no longer directly writable by signed-in users; admin access changes go through a database function that re-checks `is_admin()`.
- **Answer keys off the table.** `questions.correct_answer` / `explanation` are no longer readable columns for ordinary clients. Grading, retries and explanations go through server RPCs; the key unlocks only after a real attempt. Saved answers now say "Unlocks after your first attempt."
- **Attempt writes are server-mediated.** `practice_attempts` no longer accepts direct browser inserts; `record_attempt()` validates and rate-limits them, so the leaderboard cannot be filled with scripted rows.
- **Guest duel demo pool.** The anonymous duel now uses a fixed 48-question demo set instead of randomly sampling the whole bank, so its answer check cannot enumerate the question bank.
- **Explanation budget.** A student can unlock at most 250 question explanations per UTC day; the same question only counts once. This keeps the teaching feature from becoming a bulk key dump.
- **Admin edits keep media.** The question editor now preserves bare `<table>`, `<svg>` and `<img>` blocks outside `<figure>`, not just figures.
- **Idempotent seed.** `seed_questions.py` now upserts by `source_id`; re-running it no longer deletes the official bank or breaks attempts and saved questions.

## 2026-10-10

### Auth and email
- **Real email delivery.** Custom SMTP is live, so signup and password-reset mail actually sends (from `sathack.community@gmail.com`). *See:* register with any address, or use "Forgot password?" on `/auth`.
- **Social sign-in: Google and GitHub.** Both buttons are live on `/auth`; Apple and Facebook were removed. Users who arrive this way get an automatic nickname and a "pick your nickname" nudge on the dashboard. *See:* `/auth`.
- **Branded emails with one-tap sign-in.** The confirmation and reset mails are styled and their buttons land the student already signed in. *See:* the inbox.

### Study plan
- **Today's mission on the dashboard.** The home page leads with the next three undone steps, their time cost and a Start button; the full week sits behind "This week in full". *See:* `/dashboard`.
- **Drills target a specific skill, not a domain.** "Targeted drill: Rhetorical Synthesis" instead of "Targeted drill: Information and Ideas". *See:* `/dashboard/plan`, week 1.
- **Task days no longer collapse.** Each task has its own Day label (previously several tasks all read "Day 4"). *See:* `/dashboard/plan`.
- **Difficulty follows measured accuracy** (below 50% → easier, above 75% → harder) instead of the plan's week number.
- **Weak domains come first**, and the diagnostic's per-domain breakdown now seeds the plan for students with little practice.
- **Tasks tick themselves** when that domain was drilled today, and **"Not today"** pushes a step to tomorrow without touching the plan.
- **Coming back is easier:** after 2+ days away the mission shrinks to one step; after 5+ days week one also drops its heaviest task and shortens the rest.
- **Current score updates itself** when a practice test is completed (it used to require editing goals by hand).
- **Check-off no longer truncates** (long plans lost ticks past 250 keys), and moving the test date invalidates the written narrative.

### Analytics
- **Skills are grouped under their domain**, with a plain-language note on what a domain and a skill are. *See:* `/dashboard/analytics`.
- **Score trend redrawn**: dot-and-line like the reference chart, a dashed goal line, the current score called out, and one pulse on the newest score. Animations respect "reduce motion".
- **Every question counts once, by its latest attempt** across analytics, the leaderboard and the right rail.

### Practice and review
- **Per-test mistake review.** "Practice test history" rows open the mistakes of that one test, with "you answered B" and, once the test is over, "correct D". *See:* `/dashboard/analytics` → click a history row.
- **Review lists say what they are** — a count line plus the student's own answer per question; the right answer is shown only after a test is finished.

### Vocab
- **Cloze cards from real SAT text.** Where a word appears in the platform's own question bank, the card shows that sentence with the word blanked — the exercise the exam itself sets. *See:* `/dashboard/vocab` → "↻ Review due".
- **Typing recall** (`⌨ Type it`) and **pronunciation** (`🔊`, browser speech, no assets).
- **The spaced-repetition schedule is actually used**: the review deck is ordered most-overdue-first, and saving a word no longer removes it from review forever.

### Tutor
- **It knows the student**: weakest measured skills with numbers, today's assigned steps, and the streak go into every answer.
- **Personal opener chips** on `/dashboard/tutor`, and an **"Ask the tutor about this"** link in lessons that pre-types the topic.
- **Support-widget shape**: the corner button opens a compact chat instead of navigating away; Escape closes it.

### Community and admin
- **Friends**: request-and-confirm, a panel on `/dashboard/community`, and a public profile at `/dashboard/u/<nickname>` showing level, XP, questions practised, accuracy and streak.
- **Leaderboard rows open a profile.**
- **Admin question editor** at `/admin/questions/[id]` ("Edit →" on any row) — preserves attached figures and choice formulas.
- **Admin user search** with pagination and the four access operations at `/admin/users`.

### Fixes worth knowing
- Duel answer choices no longer crush or overlap: options carrying a table, graph or image take the full row and scroll instead of squeezing text into a one-character column.
- Lesson step text no longer overlaps itself (a CSS selector was styling both the step number and the step text).
- Leftover light-palette styles from the old admin theme were removed from the community join-requests card and the vocabulary button.
- "1 weeks" now reads "1 week".

### Hackathon demo accounts
- **The 100 demo students now read as 100 different people.** Each has its own name, **25–90 answered questions** (was 20), practice spread over **2–12 different days**, and **1–3 completed practice tests** with its own score history. Accuracy runs 14–90%. *See:* `/dashboard/leaderboard` → any row → profile.
- **No two are alike:** 100 unique names and nicknames, 88 target scores, 96 current scores, 71 test dates, 40 sign-up dates.
- **Names agree in gender** — a randomly paired pool had produced "Aisha Nurmatov" and "Begimai Kadyrov", which read as fake.
- **Everyone is aiming higher:** no profile shows a current score above its target, and no test date sits in the past.
- **The three real students keep the top three places** (4745 / 1148 / 847 XP against the best demo's 825).
- **Fixed:** public profiles came back blank (XP 0, 0 questions) for anyone ranked below 100, because the profile lookup reused a leaderboard call that capped itself at 100 rows.
