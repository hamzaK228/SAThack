import type { SessionQuestion } from "./session-questions";
export type AssessmentKind = "adaptive" | "diagnostic";
export type Assessment = {
  id: string; kind: AssessmentKind; status: "in_progress" | "completed";
  moduleIndex: number; questionIndex: number; answers: Record<string,string>; marked: string[];
  deadline: string | null; serverNow: string;
  module: { label: string; section: string; questions: Omit<SessionQuestion,"correct_answer" | "explanation">[] };
  result: { rwCorrect: number; mathCorrect: number; rwTotal: number; mathTotal: number; rwScore: number; mathScore: number; total: number } | null;
};
