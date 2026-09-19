export const QUESTION_COLUMNS = "id, section, domain, skill, difficulty, is_grid_in, question_text, question_text_html, passage, passage_html, choices, correct_answer, explanation";
export const QUESTION_BATCH_SIZE = 20;

export type SessionQuestion = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  is_grid_in: boolean;
  question_text: string;
  question_text_html?: string | null;
  passage: string | null;
  passage_html?: string | null;
  choices: { label: string; text: string; html?: string | null }[] | null;
  correct_answer: string;
  explanation: string | null;
};
