/**
 * Per-question solve status, derived from the user's practice attempts.
 * Shared by the Study Session so the bank's Unsolved / Solved / Missed
 * filters and the review queue never disagree.
 *
 * `attempts` must be newest-first: a question's status is its LATEST
 * attempt, so correcting a miss moves it from Missed to Solved — and
 * missing it again moves it back.
 *   - answered: attempted at least once
 *   - solved:   latest attempt correct
 *   - missed:   latest attempt wrong
 */

export type AttemptRow = { question_id: string | null; is_correct: boolean | null };

export type QuestionStatus = {
  answered: Set<string>;
  solved: Set<string>;
  missed: Set<string>;
};

export function computeStatuses(attempts: AttemptRow[]): QuestionStatus {
  const answered = new Set<string>();
  const solved = new Set<string>();
  const missed = new Set<string>();

  for (const a of attempts) {
    if (!a.question_id || answered.has(a.question_id)) continue;
    answered.add(a.question_id);
    if (a.is_correct === true) solved.add(a.question_id);
    else if (a.is_correct === false) missed.add(a.question_id);
  }

  return { answered, solved, missed };
}
