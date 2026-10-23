export type ReviewAttempt = {
  question_id: string | null;
  domain: string | null;
  is_correct: boolean | null;
  selected_answer: string | null;
  correct_answer: string | null;
  mode: string;
  created_at: string;
};

const DRILL_MODES = new Set(["drill"]);
const TEST_MODES = new Set(["full_test", "module"]);

/**
 * The review queue: questions whose latest recorded attempt was wrong and
 * that haven't been mastered since — any later correct attempt, in any mode,
 * clears them. Ordered most-recently-missed first.
 *
 * `mode` picks WHICH attempts fill the queue and defaults to "drill": misses
 * from a full practice test (full_test) or a diagnostic (module) stay in the
 * per-test review — like Bluebook, where a test's mistakes live inside that
 * test, not in a global queue. Mastery is still judged across all modes, so
 * drilling a missed test question correct removes it from the test review too.
 */
export async function getDueReview(
  supabase: Awaited<ReturnType<(typeof import("@/lib/supabase/server"))["createClient"]>>,
  userId: string,
  mode: "drill" | "test" = "drill",
  mastery = false
): Promise<{ dueIds: string[]; queueAttempt: Map<string, ReviewAttempt> }> {
  const wanted = mode === "test" ? TEST_MODES : DRILL_MODES;
  const attempts: ReviewAttempt[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from("practice_attempts")
        .select("question_id, domain, is_correct, selected_answer, correct_answer, mode, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    const rows = (data ?? []) as ReviewAttempt[];
    attempts.push(...rows);
    if (rows.length < pageSize) break;
  }

  const latestOverall = new Map<string, boolean>();
  const latestInQueue = new Map<string, boolean>();
  const queueAttempt = new Map<string, ReviewAttempt>();
  const history = new Map<string, boolean[]>();
  for (const attempt of attempts) {
    if (!attempt.question_id) continue;
    const rows = history.get(attempt.question_id) ?? [];
    rows.push(attempt.is_correct === true);
    history.set(attempt.question_id, rows);
    if (!latestOverall.has(attempt.question_id)) latestOverall.set(attempt.question_id, attempt.is_correct === true);
    if (wanted.has(attempt.mode) && !latestInQueue.has(attempt.question_id)) {
      latestInQueue.set(attempt.question_id, attempt.is_correct === true);
      queueAttempt.set(attempt.question_id, attempt);
    }
  }
  const dueIds = [...latestInQueue.entries()]
    .filter(([id, correct]) => {
      if (!correct) return latestOverall.get(id) !== true;
      if (!mastery) return false;
      // Mastery mode keeps a question until its three most recent attempts are
      // all correct. A wrong attempt anywhere in that window puts it back.
      const rows = history.get(id) ?? [];
      return !(rows.length >= 3 && rows.slice(0, 3).every(Boolean));
    })
    .map(([id]) => id);
  return { dueIds, queueAttempt };
}
