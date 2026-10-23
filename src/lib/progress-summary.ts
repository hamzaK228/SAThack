import { cache } from "react";
import { createClient } from "./supabase/server";
import { levelFor, streakFrom, xpFor } from "./gamification";

export const getProgressSummary = cache(async () => {
  const db = await createClient();
  const [summaryResult, attemptsResult] = await Promise.all([
    db.rpc("progress_summary"),
    (async () => {
      // The rail's "Questions" stat means distinct questions practiced, and its
      // accuracy follows the same rule the analytics page and the question bank
      // use: every question counts once, with the status of its LATEST attempt
      // (answered wrong then corrected = one solved question, not one correct
      // and one wrong). XP stays per recorded attempt, to reward the retry.
      // Rows come newest-first, so a question's first sighting is its latest.
      const questions = new Map<string, boolean>();
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await db
          .from("practice_attempts")
          .select("question_id, is_correct")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw new Error("Could not load your progress.");
        for (const row of data ?? []) {
          if (row.question_id && !questions.has(row.question_id)) {
            questions.set(row.question_id, row.is_correct === true);
          }
        }
        if (!data || data.length < pageSize) return questions;
      }
    })(),
  ]);
  if (summaryResult.error) throw new Error("Could not load your progress.");
  const summary = summaryResult.data as { attempts: number; correct: number; tests: number; vocabReviews: number; days: Record<string, number>; recent: { domain: string; is_correct: boolean; created_at: string }[] };
  const streak = streakFrom(Object.keys(summary.days));
  const solved = [...attemptsResult.values()].filter(Boolean).length;
  // XP follows the same latest-attempt rule as the leaderboard and accuracy:
  // one question, one reward. The raw attempt counts stay available for the
  // activity log but never mint XP.
  const xp = xpFor({
    ...summary,
    attempts: attemptsResult.size,
    correct: solved,
    activeDays: streak.activeDays,
  });
  return {
    ...summary,
    practiced: attemptsResult.size,
    solved,
    ...streak,
    xp,
    level: levelFor(xp),
    accuracy: attemptsResult.size ? Math.round((solved / attemptsResult.size) * 100) : 0,
  };
});
