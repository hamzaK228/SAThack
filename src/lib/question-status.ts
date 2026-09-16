/**
 * Per-question solve status, derived from the user's practice attempts.
 * Shared by the Question Bank and the Study Session so the two never disagree.
 *
 * Semantics (matches the bank's Unsolved / Solved / Missed / All filter):
 *   - answered: attempted at least once
 *   - solved:   answered correctly at least once
 *   - missed:   answered incorrectly at least once (still in the review queue)
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
    if (!a.question_id) continue;
    answered.add(a.question_id);
    if (a.is_correct === true) solved.add(a.question_id);
    else if (a.is_correct === false) missed.add(a.question_id);
  }

  return { answered, solved, missed };
}
