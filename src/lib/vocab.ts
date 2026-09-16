/**
 * Vocabulary helpers — text cleanup for PDF-derived examples plus the
 * spaced-repetition schedule that powers "Know it / Review again".
 */

/**
 * The word list was extracted from PDFs whose running headers/footers leaked
 * into a handful of example sentences, e.g.
 *   "…to abet him.) SAT Vocabulary A"
 *   "…accentuate the positive in life.) A SAT Vocabulary"
 * Strip that trailing boilerplate (and any orphaned closing paren) so the card
 * always shows a clean, complete sentence.
 */
export function cleanExample(example: string | null | undefined): string | null {
  if (!example) return null;
  const cut = example
    // Running footer: "…to abet him.) SAT Vocabulary A"
    .split(/\s*\)?\s*(?:A\s+)?SAT\s+Vocab(?:ulary)?\b/)[0]
    // Next-entry bleed: "…the sport.) abide 1. (v.) to put up with …"
    .split(/\s*\)?\s*[a-z][a-z-]{2,20}\s+[1-9]\.\s*\((?:n|v|adj|adv)\.\)/)[0];
  const cleaned = cut.replace(/\s*\)\s*$/, "").trim();
  return cleaned || null;
}

/** Mastery is capped so the review interval can't grow forever. */
export const MASTERY_MAX = 5;

/** Days until a word is shown again, indexed by its (new) mastery level. */
const REVIEW_INTERVAL_DAYS = [0, 1, 2, 4, 7, 14, 30];

export type VocabProgress = {
  word_id: string;
  saved: boolean;
  mastery: number;
  times_seen: number;
  times_correct: number;
  next_review_at: string | null;
};

/** When should a word with this mastery level come back? */
export function nextReviewAt(mastery: number, from: Date = new Date()): string {
  const level = Math.min(Math.max(mastery, 0), MASTERY_MAX);
  const days = REVIEW_INTERVAL_DAYS[level] ?? 0;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Apply a "Know it" / "Review again" answer to a word's spaced-repetition
 * state. Getting a word right pushes it further out (1 → 2 → 4 → 7 → 14 → 30
 * days); missing it resets mastery so the word returns immediately.
 */
export function applyReview(state: { mastery: number; times_seen: number; times_correct: number }, known: boolean) {
  const mastery = known ? Math.min(state.mastery + 1, MASTERY_MAX) : 0;
  return {
    mastery,
    times_seen: state.times_seen + 1,
    times_correct: state.times_correct + (known ? 1 : 0),
    last_seen_at: new Date().toISOString(),
    next_review_at: nextReviewAt(mastery),
  };
}

/** A word is "due" once its scheduled review time has passed. */
export function isDue(row: VocabProgress, now: Date = new Date()): boolean {
  if (row.saved) return false;
  if (!row.next_review_at) return row.times_seen > 0;
  return new Date(row.next_review_at).getTime() <= now.getTime();
}
