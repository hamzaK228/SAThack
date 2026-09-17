/**
 * Test-date arithmetic.
 *
 * The one rule that matters: a date-only value like `"2026-03-10"` must be read
 * as a *calendar* date, not as UTC midnight. `new Date("2026-03-10")` lands on
 * UTC midnight, which is still the 9th (or the 11th) for most of the world —
 * that off-by-one is why a countdown can read "6 days" when a student is 7 days
 * out. Everything here works in local calendar days.
 *
 * Shared by the dashboard countdown (src/components/dashboard/ExamDate.tsx),
 * the study-plan engine (src/lib/plan.ts) and the AI prompt
 * (src/lib/ai/study-plan.ts), so every "days until test day" agrees.
 */

/** `"2026-10-03"` → local midnight. Null when the string isn't a date. */
export function localMidnight(date: string): Date | null {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Whole days from today (local) to `date` (local). Negative once it's in the
 * past. `Math.round` — not `ceil` — so a 23- or 25-hour DST day still counts as
 * one day.
 */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = localMidnight(date);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Long, local date label — matches the countdown's notion of "the test day". */
export function formatTestDate(date: string): string {
  const parsed = localMidnight(date);
  if (!parsed) return date;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
