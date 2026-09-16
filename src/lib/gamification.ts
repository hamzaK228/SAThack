/**
 * Gamification — XP, levels, badges and streaks.
 *
 * Everything is *derived* from data we already store (practice attempts, test
 * sessions, vocab reviews), so the numbers can never drift out of sync and no
 * extra writes are needed. The SQL twin of the XP formula lives in
 * `migrations/2026-09-15-polish.sql` (`public.leaderboard`).
 */

export const XP_PER_ATTEMPT = 2;
export const XP_PER_CORRECT = 5;
export const XP_PER_TEST = 100;
export const XP_PER_VOCAB_REVIEW = 3;
export const XP_PER_ACTIVE_DAY = 10;

export type ProgressStats = {
  attempts: number;
  correct: number;
  tests: number;
  vocabReviews: number;
  activeDays: number;
  streak: number;
  bestStreak: number;
};

/** Total XP for a set of progress stats. */
export function xpFor(s: Pick<ProgressStats, "attempts" | "correct" | "tests" | "vocabReviews" | "activeDays">): number {
  return (
    s.attempts * XP_PER_ATTEMPT +
    s.correct * XP_PER_CORRECT +
    s.tests * XP_PER_TEST +
    s.vocabReviews * XP_PER_VOCAB_REVIEW +
    s.activeDays * XP_PER_ACTIVE_DAY
  );
}

/** XP required to *reach* a level. Level 1 starts at 0; each level costs 200·(n−1) more. */
export function xpForLevel(level: number): number {
  const n = Math.max(1, level);
  return 100 * n * (n - 1);
}

const TITLES = [
  "Rookie",
  "Apprentice",
  "Grinder",
  "Sharp",
  "Contender",
  "Strategist",
  "Ace",
  "Scholar",
  "Elite",
  "Perfect",
];

export type Level = {
  level: number;
  title: string;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** XP still needed for the next level. */
  toNext: number;
  nextTitle: string;
};

export function levelFor(xp: number): Level {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const into = Math.round(xp - floor);
  const span = Math.max(1, ceil - floor);
  return {
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    into,
    span,
    toNext: Math.max(0, Math.round(ceil - xp)),
    nextTitle: TITLES[Math.min(level, TITLES.length - 1)],
  };
}

export type Badge = { id: string; icon: string; name: string; hint: string; earned: boolean };

/** Badges unlock purely from progress stats — no stored state required. */
export function badgesFor(s: ProgressStats): Badge[] {
  const acc = s.attempts ? (s.correct / s.attempts) * 100 : 0;
  const defs: [string, string, string, string, boolean][] = [
    ["first-steps", "🚀", "First Steps", "Answer your first question", s.attempts >= 1],
    ["warmed-up", "🔥", "Warmed Up", "Answer 50 questions", s.attempts >= 50],
    ["century", "💯", "Century", "Answer 100 questions", s.attempts >= 100],
    ["half-grand", "🏋️", "Half Grand", "Answer 500 questions", s.attempts >= 500],
    ["sharp", "🎯", "Sharpshooter", "80% accuracy over 20+ questions", acc >= 80 && s.attempts >= 20],
    ["flawless", "💎", "Flawless", "95% accuracy over 50+ questions", acc >= 95 && s.attempts >= 50],
    ["test-pilot", "▣", "Test Pilot", "Finish a full practice test", s.tests >= 1],
    ["mock-master", "🛩️", "Mock Master", "Finish 5 practice tests", s.tests >= 5],
    ["wordsmith", "📖", "Wordsmith", "Review 100 vocab words", s.vocabReviews >= 100],
    ["lexicon", "📚", "Lexicon", "Review 500 vocab words", s.vocabReviews >= 500],
    ["on-fire", "⚡", "On Fire", "Study 7 days in a row", s.streak >= 7],
    ["unstoppable", "🌋", "Unstoppable", "Study 30 days in a row", s.streak >= 30],
    ["marathoner", "🏃", "Marathoner", "Study on 50 distinct days", s.activeDays >= 50],
  ];
  return defs.map(([id, icon, name, hint, earned]) => ({ id, icon, name, hint, earned }));
}

export type StreakInfo = { streak: number; bestStreak: number; activeDays: number };

/**
 * Current streak (consecutive days up to today or yesterday), best streak, and
 * the number of distinct active days — all from a list of ISO timestamps.
 */
export function streakFrom(timestamps: (string | null | undefined)[]): StreakInfo {
  const days = new Set<string>();
  for (const t of timestamps) {
    if (!t) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    days.add(d.toISOString().slice(0, 10));
  }
  if (days.size === 0) return { streak: 0, bestStreak: 0, activeDays: 0 };

  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    run = cur - prev === 86_400_000 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const today = new Date();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000);
  let streak = 0;
  if (days.has(key(today)) || days.has(key(yesterday))) {
    let cursor = days.has(key(today)) ? today : yesterday;
    while (days.has(key(cursor))) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }
  }

  return { streak, bestStreak: best, activeDays: days.size };
}
